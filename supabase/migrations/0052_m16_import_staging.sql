-- M16-01: private, tree-scoped import jobs and non-canonical staging rows.
begin;

-- Import-only structured source MIME support; the bucket remains private and all other
-- media purposes retain their original allowlist.
update storage.buckets set allowed_mime_types=array[
  'image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/mp4','video/mp4',
  'application/json','text/csv'
]::text[],updated_at=clock_timestamp() where id='family-assets';

create or replace function private.media_validate_upload(
  p_mime text,p_size bigint,p_filename text,p_sha256 text,p_purpose text,p_visibility text
)
returns void language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_limit bigint;
begin
  if p_mime not in ('image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/mp4','video/mp4')
     and not (p_purpose='import' and p_mime in ('application/json','text/csv')) then
    raise exception using errcode='22023',message='media MIME type is not allowed';
  end if;
  v_limit:=case when p_mime in ('image/jpeg','image/png','image/webp') then 15728640
    when p_mime='application/pdf' then 26214400 when p_mime in ('audio/mpeg','audio/mp4') then 52428800
    when p_mime='video/mp4' then 104857600 when p_mime in ('application/json','text/csv') then 10485760 end;
  if p_size is null or p_size<1 or p_size>v_limit then raise exception using errcode='22023',message='media size is outside the allowed limit'; end if;
  if p_filename is null or length(p_filename)<1 or length(p_filename)>255 or p_filename ~ '[[:cntrl:]]'
     or position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 then raise exception using errcode='22023',message='media filename is invalid'; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='media SHA-256 is invalid'; end if;
  if p_purpose not in ('portrait','source','album','import','receipt','scholarship') then raise exception using errcode='22023',message='media purpose is invalid'; end if;
  if p_visibility not in ('restricted','members','public') then raise exception using errcode='22023',message='media visibility is invalid'; end if;
end;
$$;

create table private.import_jobs (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  source_asset_id uuid not null,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  format text not null check (format in ('csv','gedcom_551','gedcom_7','canonical_json')),
  source_namespace text not null check (length(source_namespace) between 1 and 200),
  mapping_version text not null check (length(mapping_version) between 1 and 100),
  parser_version text not null,
  classification text not null check (classification in ('structured','gedcom','canonical')),
  status text not null default 'queued' check (status in ('queued','parsing','needs_review','ready','applying','partially_applied','completed','failed','cancelled')),
  approval_hash text,
  counters jsonb not null default '{"processed":0,"succeeded":0,"failed":0,"skipped":0}'::jsonb,
  manifest jsonb not null default '{}'::jsonb,
  unique (tree_id, id),
  unique (tree_id, file_sha256, mapping_version),
  foreign key (source_asset_id) references private.media_assets(id)
);

create table private.import_rows (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  job_id uuid not null,
  row_number integer not null check (row_number > 0),
  external_id text,
  raw_payload jsonb,
  normalized jsonb,
  status text not null check (status in ('valid','invalid','review')),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  unique (tree_id, job_id, row_number),
  foreign key (tree_id, job_id) references private.import_jobs(tree_id, id) on delete cascade
);

create index import_jobs_tree_created_idx on private.import_jobs(tree_id, created_at desc);
create index import_rows_job_status_idx on private.import_rows(tree_id, job_id, status, row_number);
alter table private.import_jobs enable row level security;
alter table private.import_jobs force row level security;
alter table private.import_rows enable row level security;
alter table private.import_rows force row level security;
revoke all on private.import_jobs, private.import_rows from public, anon, authenticated;

-- Keep the M09 media policy unchanged; grant import workers only ready import objects.
create or replace function private.import_storage_select_allowed(p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog, private
as $$
  select exists (select 1 from private.media_assets m where m.object_path=p_name
    and m.purpose='import' and m.state='ready' and m.actual_sha256=m.expected_sha256
    and private.has_capability(m.tree_id,'imports.manage',null));
$$;
drop policy if exists import_sources_select on storage.objects;
create policy import_sources_select on storage.objects for select to authenticated
using (bucket_id='family-assets' and private.import_storage_select_allowed(name));

create or replace function private.import_source_context(p_asset_id uuid)
returns table(id uuid,tree_id uuid,object_path text,mime_type text,size_bytes bigint,sha256 text)
language plpgsql stable security definer set search_path = pg_catalog, private
as $$
begin
  return query select m.id,m.tree_id,m.object_path,coalesce(m.mime_type,m.declared_mime),
    coalesce(m.actual_size_bytes,m.size_bytes),m.actual_sha256
  from private.media_assets m where m.id=p_asset_id and m.purpose='import'
    and m.state='ready' and m.actual_sha256=m.expected_sha256
    and private.has_capability(m.tree_id,'imports.manage',null);
  if not found then raise exception using errcode='P0002',message='ready import source not found'; end if;
end;
$$;

drop function if exists api.import_create(uuid,uuid,text,text,text,text);
drop function if exists private.import_create(uuid,uuid,text,text,text,text);

create or replace function private.import_create(
  p_tree_id uuid, p_asset_id uuid, p_format text, p_source_namespace text,
  p_mapping_version text, p_mode text, p_idempotency_key uuid, p_request_hash text
)
returns table (id uuid, version bigint, status text, tree_id uuid, source_asset_id uuid,
  file_sha256 text, format text, source_namespace text, mapping_version text,
  classification text, counters jsonb, warnings jsonb)
language plpgsql security definer set search_path = pg_catalog, private
as $$
declare
  v_actor uuid := auth.uid();
  v_asset private.media_assets%rowtype;
  v_job private.import_jobs%rowtype;
  v_existing private.idempotency_records%rowtype;
  v_inserted integer;
  v_classification text;
begin
  if v_actor is null then raise exception using errcode='28000', message='authenticated actor required'; end if;
  if p_mode <> 'demo' then raise exception using errcode='42501', message='real-data import requires approved H5 scope'; end if;
  if not private.has_capability(p_tree_id, 'imports.manage', null) then
    raise exception using errcode='42501', message='imports.manage capability required';
  end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash),'') is null then
    raise exception using errcode='22023', message='idempotency key and request hash are required';
  end if;
  if p_format not in ('csv','gedcom_551','gedcom_7','canonical_json')
     or nullif(btrim(p_source_namespace),'') is null or length(p_source_namespace)>200
     or nullif(btrim(p_mapping_version),'') is null or length(p_mapping_version)>100 then
    raise exception using errcode='22023', message='import metadata is invalid';
  end if;
  select * into v_asset from private.media_assets a
    where a.id=p_asset_id and a.tree_id=p_tree_id and a.purpose='import'
      and a.state='ready' and a.actual_sha256=a.expected_sha256;
  if not found then raise exception using errcode='P0002', message='ready import source not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tree_id::text||':'||v_actor::text||':import.create:'||p_idempotency_key::text,0));
  select * into v_existing from private.idempotency_records r
    where r.tree_id=p_tree_id and r.actor_id=v_actor and r.operation='import.create'
      and r.idempotency_key=p_idempotency_key and r.expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash<>p_request_hash then
      raise exception using errcode='P0008',message='idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode='P0008',message='idempotent request is still in progress';
    end if;
    select * into v_job from private.import_jobs j where j.id=(v_existing.response->>'jobId')::uuid;
    if not found then raise exception using errcode='P0002',message='idempotent import job not found'; end if;
    return query select v_job.id,v_job.version,v_job.status,v_job.tree_id,v_job.source_asset_id,
      v_job.file_sha256,v_job.format,v_job.source_namespace,v_job.mapping_version,
      v_job.classification,v_job.counters,coalesce(v_job.manifest->'warnings','[]'::jsonb);
    return;
  end if;
  v_classification := case when p_format='canonical_json' then 'canonical'
    when p_format like 'gedcom%' then 'gedcom' else 'structured' end;
  insert into private.import_jobs(tree_id,created_by,source_asset_id,file_sha256,format,
    source_namespace,mapping_version,parser_version,classification,status,manifest)
  values(p_tree_id,v_actor,p_asset_id,v_asset.actual_sha256,p_format,btrim(p_source_namespace),
    btrim(p_mapping_version),'canonical-json/1',v_classification,'queued',
    jsonb_build_object('mode','demo','warnings',case when p_format like 'gedcom%'
      then jsonb_build_array('unknown_tags_preserved_for_review') else '[]'::jsonb end))
  on conflict on constraint import_jobs_tree_id_file_sha256_mapping_version_key do nothing
  returning * into v_job;
  if v_job.id is null then
    select * into v_job from private.import_jobs j
      where j.tree_id=p_tree_id and j.file_sha256=v_asset.actual_sha256
        and j.mapping_version=btrim(p_mapping_version) for update;
    if v_job.format<>p_format or v_job.source_namespace<>btrim(p_source_namespace) then
      raise exception using errcode='P0008', message='source checksum already has a different import mapping';
    end if;
  else
    insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
      values(p_tree_id,v_actor,'import.created','import',v_job.id,gen_random_uuid(),'Private demo import staging job created');
  end if;
  delete from private.idempotency_records r where r.tree_id=p_tree_id and r.actor_id=v_actor
    and r.operation='import.create' and r.idempotency_key=p_idempotency_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(p_tree_id,v_actor,'import.create',p_idempotency_key,p_request_hash,
      jsonb_build_object('jobId',v_job.id),clock_timestamp()+interval '24 hours')
    on conflict on constraint idempotency_records_tree_id_actor_id_operation_idempotency__key do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then raise exception using errcode='P0008',message='idempotent import reservation conflict'; end if;
  return query select v_job.id,v_job.version,v_job.status,v_job.tree_id,v_job.source_asset_id,
    v_job.file_sha256,v_job.format,v_job.source_namespace,v_job.mapping_version,
    v_job.classification,v_job.counters,coalesce(v_job.manifest->'warnings','[]'::jsonb);
end;
$$;

create or replace function private.import_stage_rows(p_job_id uuid,p_rows jsonb,p_warnings jsonb)
returns table(id uuid,version bigint,status text,valid bigint,invalid bigint,possible_duplicates bigint,snapshot_hash text)
language plpgsql security definer set search_path = pg_catalog, private, extensions
as $$
declare
  v_actor uuid := auth.uid(); v_job private.import_jobs%rowtype; v_valid bigint; v_invalid bigint; v_review bigint; v_hash text; v_input_hash text;
begin
  if v_actor is null then raise exception using errcode='28000', message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs j where j.id=p_job_id for update;
  if not found then raise exception using errcode='P0002', message='import job not found'; end if;
  if not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501', message='imports.manage capability required'; end if;
  if v_job.status not in ('queued','parsing','needs_review') or jsonb_typeof(p_rows)<>'array'
     or jsonb_array_length(p_rows)>10000 or jsonb_typeof(p_warnings)<>'array' then
    raise exception using errcode='22023', message='staging payload is invalid'; end if;
  v_input_hash := encode(extensions.digest(p_rows::text,'sha256'),'hex');
  if v_job.manifest->>'inputRowsHash'=v_input_hash and v_job.manifest->'warnings'=p_warnings then
    return query select v_job.id,v_job.version,v_job.status,
      coalesce((v_job.manifest->>'valid')::bigint,0),coalesce((v_job.manifest->>'invalid')::bigint,0),
      coalesce((v_job.manifest->>'possibleDuplicates')::bigint,0),coalesce(v_job.manifest->>'previewHash','');
    return;
  end if;
  delete from private.import_rows r where r.tree_id=v_job.tree_id and r.job_id=v_job.id;
  insert into private.import_rows(tree_id,created_by,job_id,row_number,external_id,raw_payload,normalized,status,errors)
  select v_job.tree_id,v_actor,v_job.id,(r->>'rowNumber')::integer,nullif(r->>'externalId',''),
    r->'rawPayload',r->'normalized',r->>'status',coalesce(r->'errors','[]'::jsonb)
  from jsonb_array_elements(p_rows) r;
  select count(*) filter(where r.status='valid'),count(*) filter(where r.status='invalid'),
    count(*) filter(where r.status='review') into v_valid,v_invalid,v_review
    from private.import_rows r where r.tree_id=v_job.tree_id and r.job_id=v_job.id;
  select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('rowNumber',r.row_number,
    'externalId',r.external_id,'rawPayload',r.raw_payload,'normalized',r.normalized,'status',r.status,'errors',r.errors)
    order by r.row_number)::text,'[]'),'sha256'),'hex')
    into v_hash from private.import_rows r where r.tree_id=v_job.tree_id and r.job_id=v_job.id;
  update private.import_jobs as j set version=j.version+1,status='needs_review',
    counters=jsonb_build_object('processed',v_valid+v_invalid+v_review,'succeeded',v_valid,'failed',v_invalid,'skipped',v_review),
    manifest=j.manifest||jsonb_build_object('warnings',p_warnings,'previewHash',v_hash,'inputRowsHash',v_input_hash,
      'valid',v_valid,'invalid',v_invalid,'possibleDuplicates',v_review)
    where j.id=v_job.id returning j.* into v_job;
  return query select v_job.id,v_job.version,v_job.status,v_valid,v_invalid,v_review,v_hash;
end;
$$;

create or replace function api.import_create(p_tree_id uuid,p_asset_id uuid,p_format text,
  p_source_namespace text,p_mapping_version text,p_mode text,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,status text,tree_id uuid,source_asset_id uuid,file_sha256 text,
  format text,source_namespace text,mapping_version text,classification text,counters jsonb,warnings jsonb)
language sql security invoker set search_path=pg_catalog
as $$ select * from private.import_create($1,$2,$3,$4,$5,$6,$7,$8); $$;

create or replace function api.import_source_context(p_asset_id uuid)
returns table(id uuid,tree_id uuid,object_path text,mime_type text,size_bytes bigint,sha256 text)
language sql security invoker set search_path=pg_catalog
as $$ select * from private.import_source_context($1); $$;

create or replace function api.import_stage_rows(p_job_id uuid,p_rows jsonb,p_warnings jsonb)
returns table(id uuid,version bigint,status text,valid bigint,invalid bigint,possible_duplicates bigint,snapshot_hash text)
language sql security invoker set search_path=pg_catalog
as $$ select * from private.import_stage_rows($1,$2,$3); $$;

-- Dedicated grant path: M07's established grant RPC intentionally has a fixed capability allowlist.
create or replace function private.import_membership_grant_create(
  p_membership_id uuid,p_branch_id uuid,p_expires_at timestamptz,p_idempotency_key uuid,p_request_hash text
)
returns table(id uuid,version bigint,status text)
language plpgsql security definer set search_path=pg_catalog,private
as $$
declare
  v_actor uuid:=auth.uid(); v_target private.memberships%rowtype;
  v_existing private.idempotency_records%rowtype; v_grant private.capability_grants%rowtype;
  v_inserted integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash),'') is null then
    raise exception using errcode='22023',message='idempotency key and request hash are required'; end if;
  if p_expires_at is not null and p_expires_at<=clock_timestamp() then
    raise exception using errcode='22023',message='grant expiration must be in the future'; end if;
  select * into v_target from private.memberships m where m.id=p_membership_id for update;
  if not found then raise exception using errcode='P0002',message='membership not found'; end if;
  if not private.membership_manage_allowed(v_target.tree_id) or not private.has_mfa() then
    raise exception using errcode='42501',message='grant management requires owner/admin and aal2'; end if;
  if p_branch_id is not null and not exists(select 1 from private.branches b where b.id=p_branch_id and b.tree_id=v_target.tree_id) then
    raise exception using errcode='23503',message='grant branch is outside the tree'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_target.tree_id::text||':'||v_actor::text||':membership.grant.import:'||p_idempotency_key::text,0));
  delete from private.idempotency_records r where r.tree_id=v_target.tree_id and r.actor_id=v_actor
    and r.operation='membership.grant.import' and r.idempotency_key=p_idempotency_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,expires_at)
    values(v_target.tree_id,v_actor,'membership.grant.import',p_idempotency_key,p_request_hash,clock_timestamp()+interval '24 hours')
    on conflict on constraint idempotency_records_tree_id_actor_id_operation_idempotency__key do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_existing from private.idempotency_records r where r.tree_id=v_target.tree_id
    and r.actor_id=v_actor and r.operation='membership.grant.import' and r.idempotency_key=p_idempotency_key for update;
  if v_inserted=0 then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key was reused with a different request'; end if;
    if v_existing.response is null then raise exception using errcode='P0008',message='idempotent request is still in progress'; end if;
    return query select (v_existing.response->>'id')::uuid,(v_existing.response->>'version')::bigint,v_existing.response->>'status'; return;
  end if;
  insert into private.capability_grants(tree_id,created_by,membership_id,capability,branch_id,expires_at)
    values(v_target.tree_id,v_actor,p_membership_id,'imports.manage',p_branch_id,p_expires_at) returning * into v_grant;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_target.tree_id,v_actor,'membership.grant.created','capability_grant',v_grant.id,gen_random_uuid(),'Synthetic imports.manage capability grant created');
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
    values(v_target.tree_id,'membership.grant.created',v_grant.id,v_grant.version,
      'membership.grant.created:'||v_grant.id::text||':'||v_grant.version::text,v_actor);
  update private.idempotency_records r set response=jsonb_build_object('id',v_grant.id,'version',v_grant.version,'status','active')
    where r.tree_id=v_target.tree_id and r.actor_id=v_actor and r.operation='membership.grant.import' and r.idempotency_key=p_idempotency_key;
  return query select v_grant.id,v_grant.version,'active'::text;
end;
$$;

create or replace function api.import_grant_create(p_membership_id uuid,p_branch_id uuid,p_expires_at timestamptz,p_idempotency_key uuid,p_request_hash text)
returns table(id uuid,version bigint,status text)
language sql security invoker set search_path=pg_catalog
as $$ select * from private.import_membership_grant_create($1,$2,$3,$4,$5); $$;

create or replace function private.import_tree_list()
returns table(id uuid,name text)
language sql stable security definer set search_path=pg_catalog,private
as $$
  select t.id,t.name from private.trees t
  where private.has_capability(t.id,'imports.manage',null)
  order by t.created_at,t.id
$$;

create or replace function api.import_tree_list()
returns table(id uuid,name text)
language sql stable security invoker set search_path=pg_catalog
as $$ select * from private.import_tree_list(); $$;

revoke all on function private.import_create(uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function private.import_create(uuid,uuid,text,text,text,text,uuid,text) to authenticated;
revoke all on function private.import_stage_rows(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.import_stage_rows(uuid,jsonb,jsonb) to authenticated;
revoke all on function private.import_source_context(uuid) from public,anon,authenticated;
grant execute on function private.import_source_context(uuid) to authenticated;
revoke all on function private.import_storage_select_allowed(text) from public,anon,authenticated;
grant execute on function private.import_storage_select_allowed(text) to authenticated;
revoke all on function api.import_create(uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant usage on schema api to authenticated;
grant execute on function api.import_create(uuid,uuid,text,text,text,text,uuid,text) to authenticated;
revoke all on function api.import_source_context(uuid) from public,anon,authenticated;
grant execute on function api.import_source_context(uuid) to authenticated;
revoke all on function api.import_stage_rows(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.import_stage_rows(uuid,jsonb,jsonb) to authenticated;
revoke all on function private.import_membership_grant_create(uuid,uuid,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function private.import_membership_grant_create(uuid,uuid,timestamptz,uuid,text) to authenticated;
revoke all on function api.import_grant_create(uuid,uuid,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function api.import_grant_create(uuid,uuid,timestamptz,uuid,text) to authenticated;
revoke all on function private.import_tree_list() from public,anon,authenticated;
grant execute on function private.import_tree_list() to authenticated;
revoke all on function api.import_tree_list() from public,anon,authenticated;
grant execute on function api.import_tree_list() to authenticated;
commit;
