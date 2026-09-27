begin;

alter table private.media_assets add constraint media_assets_tree_id_unique unique (tree_id, id);

alter table private.sources
  add column provider_name text,
  add column recorded_date jsonb,
  add column original_asset_id uuid;

alter table private.sources
  add constraint sources_original_asset_same_tree_fk
  foreign key (tree_id, original_asset_id) references private.media_assets(tree_id, id);

create table private.citations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  source_id uuid not null,
  person_id uuid,
  fact_id uuid,
  parent_link_id uuid,
  union_id uuid,
  locator text not null,
  quoted_text text,
  confidence text check (confidence in ('unverified','supported','verified','disputed')),
  unique (tree_id, id),
  foreign key (tree_id, source_id) references private.sources(tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id),
  foreign key (tree_id, fact_id) references private.person_facts(tree_id, id),
  foreign key (tree_id, parent_link_id) references private.parent_links(tree_id, id),
  foreign key (tree_id, union_id) references private.unions(tree_id, id),
  check (length(btrim(locator)) between 1 and 1000),
  check (num_nonnulls(person_id, fact_id, parent_link_id, union_id) = 1)
);

create index citations_source_idx on private.citations (tree_id, source_id, id);
create index citations_person_idx on private.citations (tree_id, person_id, id) where person_id is not null;
create index citations_fact_idx on private.citations (tree_id, fact_id, id) where fact_id is not null;

drop trigger if exists touch_sources on private.sources;
create trigger touch_sources before update on private.sources
for each row execute function private.touch_updated_at();
drop trigger if exists touch_citations on private.citations;
create trigger touch_citations before update on private.citations
for each row execute function private.touch_updated_at();

alter table private.sources enable row level security;
alter table private.sources force row level security;
alter table private.citations enable row level security;
alter table private.citations force row level security;
revoke all on table private.sources from public, anon, authenticated;
revoke all on table private.citations from public, anon, authenticated;

create or replace function private.source_projection_authorized(p_tree_id uuid, p_source_id uuid default null)
returns table (id uuid, tree_id uuid, version bigint, title text, kind text, provider_name text,
  provenance text, recorded_date jsonb, original_asset_id uuid, visibility text, rights_note text)
language sql stable security definer set search_path = pg_catalog, private
as $$
  select s.id, s.tree_id, s.version, s.title, s.kind, s.provider_name, s.provenance,
    s.recorded_date, s.original_asset_id, s.visibility, s.rights_note
  from private.sources s
  where s.tree_id = p_tree_id
    and (p_source_id is null or s.id = p_source_id)
    and private.has_capability(s.tree_id, 'source.read', null)
    and (s.visibility <> 'restricted' or private.is_active_member(s.tree_id));
$$;

create or replace function private.source_create_idempotent(
  p_tree_id uuid, p_title text, p_kind text, p_provider_name text, p_provenance text,
  p_recorded_date jsonb, p_original_asset_id uuid, p_visibility text, p_rights_note text,
  p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, version bigint, title text, kind text, provider_name text,
  provenance text, recorded_date jsonb, original_asset_id uuid, visibility text, rights_note text)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_existing private.idempotency_records%rowtype;
  v_source private.sources%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if not private.has_capability(p_tree_id, 'source.write', null) then
    raise exception using errcode = '42501', message = 'source write capability required';
  end if;
  if nullif(btrim(p_title), '') is null or length(p_title) > 500 then
    raise exception using errcode = '22023', message = 'source title is invalid';
  end if;
  if p_kind not in ('book','oral','document','photo','website','other') then
    raise exception using errcode = '22023', message = 'source kind is invalid';
  end if;
  if nullif(btrim(p_provenance), '') is null or length(p_provenance) > 5000 then
    raise exception using errcode = '22023', message = 'source provenance is invalid';
  end if;
  if p_visibility not in ('public','members','restricted') then
    raise exception using errcode = '22023', message = 'source visibility is invalid';
  end if;
  if p_original_asset_id is not null and not exists (
    select 1 from private.media_assets m where m.tree_id = p_tree_id and m.id = p_original_asset_id and m.state = 'ready'
  ) then
    raise exception using errcode = '23503', message = 'source original asset is unavailable';
  end if;
  select * into v_existing from private.idempotency_records r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'source.create'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp() for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    return query select (v_existing.response->>'id')::uuid, p_tree_id,
      (v_existing.response->>'version')::bigint, v_existing.response->>'title', v_existing.response->>'kind',
      nullif(v_existing.response->>'providerName',''), v_existing.response->>'provenance',
      v_existing.response->'recordedDate', nullif(v_existing.response->>'originalAssetId','')::uuid,
      v_existing.response->>'visibility', nullif(v_existing.response->>'rightsNote','');
    return;
  end if;
  insert into private.sources (tree_id, created_by, title, kind, provider_name, provenance, recorded_date, original_asset_id, visibility, rights_note)
  values (p_tree_id, v_actor, btrim(p_title), p_kind, nullif(btrim(p_provider_name), ''), btrim(p_provenance), p_recorded_date, p_original_asset_id, p_visibility, p_rights_note)
  returning * into v_source;
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at, response)
  values (p_tree_id, v_actor, 'source.create', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours',
    jsonb_build_object('id', v_source.id, 'version', v_source.version, 'title', v_source.title, 'kind', v_source.kind,
      'providerName', v_source.provider_name, 'provenance', v_source.provenance, 'recordedDate', v_source.recorded_date,
      'originalAssetId', v_source.original_asset_id, 'visibility', v_source.visibility, 'rightsNote', v_source.rights_note));
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary)
  values (p_tree_id, v_actor, 'source.created', 'source', v_source.id, gen_random_uuid(), 'Source created with tree-scoped citation support');
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (p_tree_id, 'source.created', v_source.id, v_source.version, 'source.created:' || v_source.id::text || ':' || v_source.version::text, v_actor);
  return query select v_source.id, v_source.tree_id, v_source.version, v_source.title, v_source.kind,
    v_source.provider_name, v_source.provenance, v_source.recorded_date, v_source.original_asset_id,
    v_source.visibility, v_source.rights_note;
end;
$$;

create or replace function private.citation_create_idempotent(
  p_tree_id uuid, p_source_id uuid, p_person_id uuid, p_fact_id uuid, p_parent_link_id uuid, p_union_id uuid,
  p_locator text, p_quoted_text text, p_confidence text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, tree_id uuid, version bigint, source_id uuid, person_id uuid, fact_id uuid,
  parent_link_id uuid, union_id uuid, locator text, quoted_text text, confidence text)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_source private.sources%rowtype;
  v_citation private.citations%rowtype;
  v_existing private.idempotency_records%rowtype;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'authenticated actor required'; end if;
  if not private.has_capability(p_tree_id, 'source.write', null) then raise exception using errcode = '42501', message = 'source write capability required'; end if;
  select * into v_source from private.sources where sources.tree_id = p_tree_id and sources.id = p_source_id;
  if not found then raise exception using errcode = 'P0002', message = 'source not found'; end if;
  if p_confidence is not null and p_confidence not in ('unverified','supported','verified','disputed') then raise exception using errcode = '22023', message = 'citation confidence is invalid'; end if;
  if nullif(btrim(p_locator), '') is null or length(p_locator) > 1000 then raise exception using errcode = '22023', message = 'citation locator is invalid'; end if;
  select * into v_existing from private.idempotency_records r
  where r.tree_id = p_tree_id and r.actor_id = v_actor and r.operation = 'citation.create'
    and r.idempotency_key = p_idempotency_key and r.expires_at > clock_timestamp() for update;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request'; end if;
    return query select (v_existing.response->>'id')::uuid, p_tree_id, (v_existing.response->>'version')::bigint,
      p_source_id, nullif(v_existing.response->>'personId','')::uuid, nullif(v_existing.response->>'factId','')::uuid,
      nullif(v_existing.response->>'parentLinkId','')::uuid, nullif(v_existing.response->>'unionId','')::uuid,
      v_existing.response->>'locator', nullif(v_existing.response->>'quotedText',''), nullif(v_existing.response->>'confidence','');
    return;
  end if;
  insert into private.citations (tree_id, created_by, source_id, person_id, fact_id, parent_link_id, union_id, locator, quoted_text, confidence)
  values (p_tree_id, v_actor, p_source_id, p_person_id, p_fact_id, p_parent_link_id, p_union_id, btrim(p_locator), p_quoted_text, p_confidence)
  returning * into v_citation;
  insert into private.idempotency_records (tree_id, actor_id, operation, idempotency_key, request_hash, expires_at, response)
  values (p_tree_id, v_actor, 'citation.create', p_idempotency_key, p_request_hash, clock_timestamp() + interval '24 hours',
    jsonb_build_object('id', v_citation.id, 'version', v_citation.version, 'personId', v_citation.person_id,
      'factId', v_citation.fact_id, 'parentLinkId', v_citation.parent_link_id, 'unionId', v_citation.union_id,
      'locator', v_citation.locator, 'quotedText', v_citation.quoted_text, 'confidence', v_citation.confidence));
  insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary)
  values (p_tree_id, v_actor, 'citation.created', 'citation', v_citation.id, gen_random_uuid(), 'Citation created with a real source foreign key');
  insert into private.outbox (tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by)
  values (p_tree_id, 'citation.created', v_citation.id, v_citation.version, 'citation.created:' || v_citation.id::text || ':' || v_citation.version::text, v_actor);
  return query select v_citation.id, v_citation.tree_id, v_citation.version, v_citation.source_id, v_citation.person_id,
    v_citation.fact_id, v_citation.parent_link_id, v_citation.union_id, v_citation.locator, v_citation.quoted_text, v_citation.confidence;
end;
$$;

create or replace function private.citations_get_authorized(p_tree_id uuid, p_source_id uuid)
returns table (id uuid, tree_id uuid, version bigint, source_id uuid, person_id uuid, fact_id uuid,
  parent_link_id uuid, union_id uuid, locator text, quoted_text text, confidence text)
language sql stable security definer set search_path = pg_catalog, private
as $$
  select c.id, c.tree_id, c.version, c.source_id, c.person_id, c.fact_id, c.parent_link_id,
    c.union_id, c.locator, c.quoted_text, c.confidence
  from private.citations c
  where c.tree_id = p_tree_id and c.source_id = p_source_id and private.has_capability(p_tree_id, 'source.read', null)
    and private.is_active_member(p_tree_id)
  order by c.id;
$$;

create or replace function api.source_create_idempotent(
  p_tree_id uuid, p_title text, p_kind text, p_provider_name text, p_provenance text,
  p_recorded_date jsonb, p_original_asset_id uuid, p_visibility text, p_rights_note text,
  p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, tree_id uuid, version bigint, title text, kind text, provider_name text,
  provenance text, recorded_date jsonb, original_asset_id uuid, visibility text, rights_note text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.source_create_idempotent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);
$$;

create or replace function api.sources_get(p_tree_id uuid)
returns table (id uuid, tree_id uuid, version bigint, title text, kind text, provider_name text,
  provenance text, recorded_date jsonb, original_asset_id uuid, visibility text, rights_note text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.source_projection_authorized($1);
$$;

create or replace function api.source_get(p_tree_id uuid, p_source_id uuid)
returns table (id uuid, tree_id uuid, version bigint, title text, kind text, provider_name text,
  provenance text, recorded_date jsonb, original_asset_id uuid, visibility text, rights_note text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.source_projection_authorized($1, $2);
$$;

create or replace function api.citation_create_idempotent(
  p_tree_id uuid, p_source_id uuid, p_person_id uuid, p_fact_id uuid, p_parent_link_id uuid, p_union_id uuid,
  p_locator text, p_quoted_text text, p_confidence text, p_idempotency_key uuid, p_request_hash text)
returns table (id uuid, tree_id uuid, version bigint, source_id uuid, person_id uuid, fact_id uuid,
  parent_link_id uuid, union_id uuid, locator text, quoted_text text, confidence text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.citation_create_idempotent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);
$$;

create or replace function api.citations_get(p_tree_id uuid, p_source_id uuid)
returns table (id uuid, tree_id uuid, version bigint, source_id uuid, person_id uuid, fact_id uuid,
  parent_link_id uuid, union_id uuid, locator text, quoted_text text, confidence text)
language sql security invoker set search_path = pg_catalog as $$
  select * from private.citations_get_authorized($1, $2);
$$;

revoke all on function private.source_projection_authorized(uuid,uuid) from public, anon, authenticated;
revoke all on function private.source_create_idempotent(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,text) from public, anon, authenticated;
revoke all on function private.citation_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function private.citations_get_authorized(uuid,uuid) from public, anon, authenticated;
grant execute on function private.source_projection_authorized(uuid,uuid) to authenticated;
grant execute on function private.source_create_idempotent(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,text) to authenticated;
grant execute on function private.citation_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text) to authenticated;
grant execute on function private.citations_get_authorized(uuid,uuid) to authenticated;

revoke all on function api.source_create_idempotent(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,text) from public, anon, authenticated;
revoke all on function api.sources_get(uuid) from public, anon, authenticated;
revoke all on function api.source_get(uuid,uuid) from public, anon, authenticated;
revoke all on function api.citation_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function api.citations_get(uuid,uuid) from public, anon, authenticated;
grant execute on function api.source_create_idempotent(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,text) to authenticated;
grant execute on function api.sources_get(uuid) to authenticated;
grant execute on function api.source_get(uuid,uuid) to authenticated;
grant execute on function api.citation_create_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text) to authenticated;
grant execute on function api.citations_get(uuid,uuid) to authenticated;

commit;
