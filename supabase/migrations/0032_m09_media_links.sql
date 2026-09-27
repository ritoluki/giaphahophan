begin;

create table if not exists private.content_pages (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  slug text not null,
  kind text not null check (kind in ('history','news','guide','policy')),
  published_revision_id uuid,
  visibility text not null default 'restricted' check (visibility in ('public','members','restricted')),
  unique (tree_id, id),
  unique (tree_id, slug)
);

create table if not exists private.content_revisions (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  page_id uuid not null,
  title text not null,
  body jsonb not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','published','archived')),
  approved_by uuid references auth.users(id) on delete set null,
  publish_at timestamptz,
  unique (tree_id, id),
  foreign key (tree_id, page_id) references private.content_pages(tree_id, id)
);

alter table private.content_pages
  add constraint content_pages_published_revision_same_tree_fk
  foreign key (tree_id, published_revision_id) references private.content_revisions(tree_id, id);

create index if not exists content_revisions_page_idx on private.content_revisions (tree_id, page_id, version desc);
create index if not exists content_revisions_published_idx on private.content_revisions (tree_id, status) where status = 'published';

drop trigger if exists touch_content_pages on private.content_pages;
create trigger touch_content_pages before update on private.content_pages
for each row execute function private.touch_updated_at();
drop trigger if exists touch_content_revisions on private.content_revisions;
create trigger touch_content_revisions before update on private.content_revisions
for each row execute function private.touch_updated_at();

create table private.media_links (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  asset_id uuid not null,
  person_id uuid,
  source_id uuid,
  content_revision_id uuid,
  caption text,
  unique (tree_id, id),
  foreign key (tree_id, asset_id) references private.media_assets(tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id),
  foreign key (tree_id, source_id) references private.sources(tree_id, id),
  foreign key (tree_id, content_revision_id) references private.content_revisions(tree_id, id),
  check (num_nonnulls(person_id, source_id, content_revision_id) = 1),
  check (caption is null or length(btrim(caption)) between 1 and 1000)
);

create index media_links_asset_idx on private.media_links (tree_id, asset_id, id);
create index media_links_person_idx on private.media_links (tree_id, person_id, id) where person_id is not null;
create index media_links_source_idx on private.media_links (tree_id, source_id, id) where source_id is not null;
create index media_links_content_idx on private.media_links (tree_id, content_revision_id, id) where content_revision_id is not null;

drop trigger if exists touch_media_links on private.media_links;
create trigger touch_media_links before update on private.media_links
for each row execute function private.touch_updated_at();

alter table private.content_pages enable row level security;
alter table private.content_pages force row level security;
alter table private.content_revisions enable row level security;
alter table private.content_revisions force row level security;
alter table private.media_links enable row level security;
alter table private.media_links force row level security;
revoke all on table private.content_pages from public, anon, authenticated;
revoke all on table private.content_revisions from public, anon, authenticated;
revoke all on table private.media_links from public, anon, authenticated;

create or replace function private.media_link_create_idempotent(
  p_tree_id uuid, p_asset_id uuid, p_person_id uuid, p_source_id uuid, p_content_revision_id uuid,
  p_caption text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, caption text)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_asset private.media_assets%rowtype;
  v_link private.media_links%rowtype;
  v_existing private.idempotency_records%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  select * into v_asset from private.media_assets m
  where m.tree_id = p_tree_id and m.id = p_asset_id and m.state = 'ready';
  if not found then raise exception using errcode = 'P0002', message = 'media asset not found'; end if;
  if v_asset.created_by <> v_actor and not private.has_capability(p_tree_id, 'media.write', null) then
    raise exception using errcode = '42501', message = 'media link capability required';
  end if;
  if num_nonnulls(p_person_id, p_source_id, p_content_revision_id) <> 1 then
    raise exception using errcode = '23514', message = 'exactly one media link target is required';
  end if;
  if p_caption is not null and (nullif(btrim(p_caption), '') is null or length(p_caption) > 1000) then
    raise exception using errcode = '22023', message = 'media link caption is invalid';
  end if;
  select * into v_existing from private.idempotency_records r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'media_link.create'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp() for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    return query select (v_existing.response->>'id')::uuid, p_tree_id, (v_existing.response->>'version')::bigint,
      (v_existing.response->>'assetId')::uuid, nullif(v_existing.response->>'personId','')::uuid,
      nullif(v_existing.response->>'sourceId','')::uuid, nullif(v_existing.response->>'contentRevisionId','')::uuid,
      nullif(v_existing.response->>'caption','');
    return;
  end if;
  insert into private.media_links (tree_id, created_by, asset_id, person_id, source_id, content_revision_id, caption)
  values (p_tree_id, v_actor, p_asset_id, p_person_id, p_source_id, p_content_revision_id, nullif(btrim(p_caption), ''))
  returning * into v_link;
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at, response)
  values (p_tree_id, v_actor, 'media_link.create', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours',
    jsonb_build_object('id', v_link.id, 'version', v_link.version, 'assetId', v_link.asset_id,
      'personId', v_link.person_id, 'sourceId', v_link.source_id, 'contentRevisionId', v_link.content_revision_id, 'caption', v_link.caption));
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary)
  values (p_tree_id, v_actor, 'media_link.created', 'media_link', v_link.id, gen_random_uuid(), 'Media link created without changing asset visibility');
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (p_tree_id, 'media_link.created', v_link.id, v_link.version, 'media_link.created:' || v_link.id::text || ':' || v_link.version::text, v_actor);
  return query select v_link.id, v_link.tree_id, v_link.version, v_link.asset_id, v_link.person_id,
    v_link.source_id, v_link.content_revision_id, v_link.caption;
end;
$$;

create or replace function private.media_links_get_authorized(p_tree_id uuid, p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, caption text)
language sql stable security definer set search_path = pg_catalog, private
as $$
  select l.id, l.tree_id, l.version, l.asset_id, l.person_id, l.source_id, l.content_revision_id, l.caption
  from private.media_links l
  join private.media_assets a on a.tree_id = l.tree_id and a.id = l.asset_id
  where l.tree_id = p_tree_id and l.asset_id = p_asset_id
    and (a.created_by = auth.uid() or private.has_capability(p_tree_id, 'media.read', null))
  order by l.id;
$$;

create or replace function api.media_link_create_idempotent(
  p_tree_id uuid, p_asset_id uuid, p_person_id uuid, p_source_id uuid, p_content_revision_id uuid,
  p_caption text, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, caption text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_link_create_idempotent($1,$2,$3,$4,$5,$6,$7,$8);
$$;

create or replace function api.media_links_get(p_tree_id uuid, p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, caption text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_links_get_authorized($1, $2);
$$;

revoke all on function private.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function private.media_links_get_authorized(uuid,uuid) from public, anon, authenticated;
grant execute on function private.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,text) to authenticated;
grant execute on function private.media_links_get_authorized(uuid,uuid) to authenticated;
revoke all on function api.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function api.media_links_get(uuid,uuid) from public, anon, authenticated;
grant execute on function api.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,text) to authenticated;
grant execute on function api.media_links_get(uuid,uuid) to authenticated;

commit;