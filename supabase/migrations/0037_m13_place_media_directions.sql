-- M13-03 place media links and scoped directions. Provider-independent text remains readable by authorization.
begin;

alter table private.media_links add column if not exists place_id uuid;
alter table private.media_links
  add constraint media_links_place_same_tree_fk
  foreign key (tree_id, place_id) references private.places(tree_id, id);
alter table private.media_links drop constraint if exists media_links_check;
alter table private.media_links
  add constraint media_links_target_check
  check (num_nonnulls(person_id, source_id, content_revision_id, place_id) = 1);
create index if not exists media_links_place_idx on private.media_links (tree_id, place_id, id) where place_id is not null;

create table private.place_directions (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  place_id uuid not null,
  instruction_text text not null,
  source_id uuid,
  visibility text not null default 'restricted' check (visibility in ('public', 'members', 'restricted')),
  unique (tree_id, id),
  foreign key (tree_id, place_id) references private.places(tree_id, id),
  foreign key (tree_id, source_id) references private.sources(tree_id, id),
  check (length(btrim(instruction_text)) between 1 and 10000)
);

create index place_directions_place_idx on private.place_directions (tree_id, place_id, version desc);
create index place_directions_source_idx on private.place_directions (tree_id, source_id, id) where source_id is not null;
drop trigger if exists touch_place_directions on private.place_directions;
create trigger touch_place_directions before update on private.place_directions
for each row execute function private.touch_updated_at();

alter table private.place_directions enable row level security;
alter table private.place_directions force row level security;
revoke all on table private.place_directions from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on table private.place_directions to service_role;

-- Replace the M09 media-link RPCs with the compatible place target parameter.
drop function if exists api.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,text);
drop function if exists private.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,text,uuid,text);
drop function if exists api.media_links_get(uuid,uuid);
drop function if exists private.media_links_get_authorized(uuid,uuid);

create or replace function private.media_link_create_idempotent(
  p_tree_id uuid, p_asset_id uuid, p_person_id uuid, p_source_id uuid, p_content_revision_id uuid, p_place_id uuid,
  p_caption text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, place_id uuid, caption text)
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
  if num_nonnulls(p_person_id, p_source_id, p_content_revision_id, p_place_id) <> 1 then
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
      nullif(v_existing.response->>'placeId','')::uuid, nullif(v_existing.response->>'caption','');
    return;
  end if;
  insert into private.media_links (tree_id, created_by, asset_id, person_id, source_id, content_revision_id, place_id, caption)
  values (p_tree_id, v_actor, p_asset_id, p_person_id, p_source_id, p_content_revision_id, p_place_id, nullif(btrim(p_caption), ''))
  returning * into v_link;
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at, response)
  values (p_tree_id, v_actor, 'media_link.create', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours',
    jsonb_build_object('id', v_link.id, 'version', v_link.version, 'assetId', v_link.asset_id,
      'personId', v_link.person_id, 'sourceId', v_link.source_id, 'contentRevisionId', v_link.content_revision_id,
      'placeId', v_link.place_id, 'caption', v_link.caption));
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary)
  values (p_tree_id, v_actor, 'media_link.created', 'media_link', v_link.id, gen_random_uuid(), 'Media link created without changing asset visibility');
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (p_tree_id, 'media_link.created', v_link.id, v_link.version, 'media_link.created:' || v_link.id::text || ':' || v_link.version::text, v_actor);
  return query select v_link.id, v_link.tree_id, v_link.version, v_link.asset_id, v_link.person_id,
    v_link.source_id, v_link.content_revision_id, v_link.place_id, v_link.caption;
end;
$$;

create or replace function private.media_links_get_authorized(p_tree_id uuid, p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, place_id uuid, caption text)
language sql stable security definer set search_path = pg_catalog, private
as $$
  select l.id, l.tree_id, l.version, l.asset_id, l.person_id, l.source_id, l.content_revision_id, l.place_id, l.caption
  from private.media_links l
  join private.media_assets a on a.tree_id = l.tree_id and a.id = l.asset_id
  where l.tree_id = p_tree_id and l.asset_id = p_asset_id
    and (a.created_by = auth.uid() or private.has_capability(p_tree_id, 'media.read', null))
  order by l.id;
$$;

create or replace function api.media_link_create_idempotent(
  p_tree_id uuid, p_asset_id uuid, p_person_id uuid, p_source_id uuid, p_content_revision_id uuid, p_place_id uuid,
  p_caption text, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, place_id uuid, caption text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_link_create_idempotent($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;

create or replace function api.media_links_get(p_tree_id uuid, p_asset_id uuid)
returns table (id uuid, tree_id uuid, version bigint, asset_id uuid, person_id uuid, source_id uuid,
  content_revision_id uuid, place_id uuid, caption text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.media_links_get_authorized($1, $2);
$$;

revoke all on function private.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function private.media_links_get_authorized(uuid,uuid) from public, anon, authenticated;
grant execute on function private.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text) to authenticated;
grant execute on function private.media_links_get_authorized(uuid,uuid) to authenticated;
revoke all on function api.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function api.media_links_get(uuid,uuid) from public, anon, authenticated;
grant execute on function api.media_link_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text) to authenticated;
grant execute on function api.media_links_get(uuid,uuid) to authenticated;

commit;