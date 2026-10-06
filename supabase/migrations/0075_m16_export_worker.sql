-- M16-06 local-demo worker boundary. Service role is restricted to per-operation
-- RPCs; every job is rebound to its initiating live auth session and current policy.
begin;

alter table private.export_jobs
  add column auth_session_id uuid,
  add column session_aal text check (session_aal in ('aal1','aal2')),
  add column worker_id uuid,
  add column lease_id uuid,
  add column lease_until timestamptz,
  add column attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  add column last_error_code text,
  add column artifact_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(artifact_manifest)='array' and jsonb_array_length(artifact_manifest)<=2);

create index export_jobs_worker_queue on private.export_jobs(status,created_at,id)
  where status in ('queued','running');

create table private.export_artifact_entries (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null,
  job_id uuid not null,
  lease_id uuid not null,
  object_path text not null,
  file_name text not null,
  content_type text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 104857600),
  state text not null default 'planned' check (state in ('planned','stored')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(tree_id,job_id) references private.export_jobs(tree_id,id) on delete cascade,
  unique(job_id,object_path)
);
alter table private.export_artifact_entries enable row level security;
alter table private.export_artifact_entries force row level security;
revoke all on private.export_artifact_entries from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('export-artifacts','export-artifacts',false,104857600,
  array['application/json','text/csv','text/plain','application/pdf','image/svg+xml']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,updated_at=clock_timestamp();

create function private.export_bind_live_session() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_session_id uuid; v_session auth.sessions%rowtype; v_claims jsonb;
begin
  v_claims:=auth.jwt();
  begin v_session_id:=(v_claims->>'session_id')::uuid;
  exception when others then raise exception using errcode='42501',message='verified export session required'; end;
  select * into v_session from auth.sessions s where s.id=v_session_id and s.user_id=auth.uid();
  if not found or v_session.aal is null or (v_session.not_after is not null and v_session.not_after<=clock_timestamp())
    or v_session.aal::text is distinct from v_claims->>'aal' then
    raise exception using errcode='42501',message='current export session required';
  end if;
  new.auth_session_id:=v_session.id;
  new.session_aal:=v_session.aal::text;
  return new;
end $$;
create trigger export_bind_live_session before insert on private.export_jobs
for each row execute function private.export_bind_live_session();

create function private.export_session_require(p_actor uuid,p_session uuid,p_original_aal text)
returns text language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_aal text;
begin
  select s.aal::text into v_aal from auth.sessions s
  where s.id=p_session and s.user_id=p_actor and s.aal is not null
    and (s.not_after is null or s.not_after>clock_timestamp());
  if not found or p_original_aal not in ('aal1','aal2')
    or (p_original_aal='aal2' and v_aal<>'aal2') then
    raise exception using errcode='42501',message='export session expired or assurance changed';
  end if;
  return v_aal;
end $$;

create or replace function private.export_job_state(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_policy bigint; v_aal text;
begin
  select * into v_job from private.export_jobs where id=p_id;
  if not found or v_job.requested_by is distinct from auth.uid()
    or v_job.auth_session_id is distinct from nullif(auth.jwt()->>'session_id','')::uuid then
    raise exception using errcode='42501',message='export job unavailable'; end if;
  v_aal:=private.export_session_require(v_job.requested_by,v_job.auth_session_id,v_job.session_aal);
  if (auth.jwt()->>'aal') is distinct from v_aal then
    raise exception using errcode='42501',message='export assurance changed'; end if;
  perform private.export_require_scope(v_job.tree_id,v_job.scope);
  select policy_version into v_policy from private.trees where id=v_job.tree_id;
  if v_policy is distinct from v_job.policy_version or v_job.expires_at<=clock_timestamp() then
    raise exception using errcode='42501',message='export expired or policy changed'; end if;
  return jsonb_build_object('id',v_job.id,'treeId',v_job.tree_id,'version',v_job.version,
    'format',case v_job.format when 'json' then 'canonical_json' when 'pdf' then 'book_pdf' else v_job.format end,
    'scope',v_job.scope,'policyVersion',v_job.policy_version,
    'audience',v_job.audience,'includeMedia',v_job.include_media,'status',v_job.status,
    'expiresAt',v_job.expires_at,'warnings',v_job.warnings);
end $$;

create function private.export_worker_authorize(p_job_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_aal text; v_policy bigint;
begin
  select * into v_job from private.export_jobs where id=p_job_id;
  if not found or v_job.status not in ('queued','running') or v_job.expires_at<=clock_timestamp() then
    raise exception using errcode='42501',message='export job unavailable'; end if;
  v_aal:=private.export_session_require(v_job.requested_by,v_job.auth_session_id,v_job.session_aal);
  perform set_config('request.jwt.claim.sub',v_job.requested_by::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_job.requested_by,
    'role','authenticated','session_id',v_job.auth_session_id,'aal',v_aal)::text,true);
  perform private.export_require_scope(v_job.tree_id,v_job.scope);
  select t.policy_version into v_policy from private.trees t where t.id=v_job.tree_id and t.data_mode='demo';
  if v_policy is distinct from v_job.policy_version then
    raise exception using errcode='42501',message='export policy changed'; end if;
end $$;

create function private.export_enqueue_requested() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
  values(new.tree_id,'export.requested',new.id,new.version,'export.requested:'||new.tree_id::text||':'||new.id::text,new.requested_by);
  return new;
end $$;
create trigger export_enqueue_requested after insert on private.export_jobs
for each row execute function private.export_enqueue_requested();

create function private.export_enqueue_cleanup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.status in ('cancelled','failed') and old.status is distinct from new.status
    and exists(select 1 from private.export_artifact_entries e where e.job_id=new.id) then
    insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
    values(new.tree_id,'export.cleanup_requested',new.id,new.version,
      'export.cleanup:'||new.tree_id::text||':'||new.id::text||':'||coalesce(new.lease_id::text,'none'),new.requested_by)
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists export_enqueue_cleanup on private.export_jobs;
create trigger export_enqueue_cleanup after update of status on private.export_jobs
for each row execute function private.export_enqueue_cleanup();

create function jobs.export_claim(p_worker_id uuid,p_lease_seconds integer default 120) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_lease uuid; v_until timestamptz; v_cleanup jsonb;
begin
  if p_worker_id is null or p_lease_seconds not between 30 and 900 then
    raise exception using errcode='22023',message='valid worker and lease required'; end if;
  for v_job in select j.* from private.export_jobs j
    where j.status in ('queued','running') and (j.lease_until is null or j.lease_until<=clock_timestamp() or j.expires_at<=clock_timestamp())
    order by j.created_at,j.id limit 25 for update skip locked
  loop
    begin
      perform private.export_worker_authorize(v_job.id);
    exception when insufficient_privilege then
      update private.export_jobs set status='cancelled',version=version+1,updated_at=clock_timestamp(),
        result_asset_id=null,last_error_code='AUTHORIZATION_REVOKED',lease_until=null
        where id=v_job.id;
      insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
        values(v_job.tree_id,v_job.requested_by,'export.cancelled_by_policy','export_job',v_job.id,gen_random_uuid(),
          'Export stopped because its initiating session or current permission is no longer valid');
      if exists(select 1 from private.export_artifact_entries e where e.job_id=v_job.id) then
        insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
          values(v_job.tree_id,'export.cleanup_requested',v_job.id,v_job.version,
            'export.cleanup:'||v_job.tree_id::text||':'||v_job.id::text||':'||coalesce(v_job.lease_id::text,'none'),v_job.requested_by)
          on conflict(dedupe_key) do nothing;
      end if;
      continue;
    end;
    if v_job.attempt_count>=3 then
      update private.export_jobs set status='failed',version=version+1,updated_at=clock_timestamp(),
        result_asset_id=null,last_error_code='EXPORT_ATTEMPTS_EXHAUSTED',lease_until=null where id=v_job.id;
      continue;
    end if;
    select coalesce(jsonb_agg(e.object_path order by e.object_path),'[]'::jsonb) into v_cleanup
      from private.export_artifact_entries e where e.job_id=v_job.id;
    v_lease:=gen_random_uuid(); v_until:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
    update private.export_jobs set status='running',version=version+1,updated_at=clock_timestamp(),
      worker_id=p_worker_id,lease_id=v_lease,lease_until=v_until,attempt_count=attempt_count+1,
      last_error_code=null,artifact_manifest='[]'::jsonb where id=v_job.id;
    return jsonb_build_object('job',private.export_job_state(v_job.id),'leaseId',v_lease,
      'leaseExpiresAt',v_until,'cleanupPaths',v_cleanup);
  end loop;
  return null;
end $$;

create function jobs.export_worker_projection(p_job_id uuid,p_worker_id uuid,p_lease_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype;
begin
  select * into v_job from private.export_jobs where id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.worker_id is distinct from p_worker_id
    or v_job.lease_id is distinct from p_lease_id or v_job.lease_until<=clock_timestamp() then
    raise exception using errcode='40001',message='export worker lease lost'; end if;
  perform private.export_worker_authorize(p_job_id);
  return private.export_projection(p_job_id);
end $$;

create or replace function jobs.export_worker_authorize_artifact(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_artifact jsonb) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_ext text; v_expected_mime text;
  v_path text; v_name text; v_type text; v_digest text; v_size bigint; v_sidecar boolean;
begin
  select * into v_job from private.export_jobs where id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.worker_id is distinct from p_worker_id
    or v_job.lease_id is distinct from p_lease_id or v_job.lease_until<=clock_timestamp() then return false; end if;
  perform private.export_worker_authorize(p_job_id);
  if p_artifact is null or jsonb_typeof(p_artifact)<>'object' or (select count(*) from jsonb_object_keys(p_artifact))<>5 then
    raise exception using errcode='22023',message='invalid export artifact manifest entry'; end if;
  v_path:=p_artifact->>'objectPath'; v_name:=p_artifact->>'fileName'; v_type:=p_artifact->>'contentType';
  v_digest:=p_artifact->>'sha256'; v_size:=(p_artifact->>'sizeBytes')::bigint;
  v_ext:=case v_job.format when 'json' then 'json' when 'csv' then 'csv' when 'gedcom_551' then 'ged' when 'gedcom_7' then 'ged'
    when 'pdf' then 'pdf' when 'svg' then 'svg' else null end;
  v_expected_mime:=case v_job.format when 'json' then 'application/json' when 'csv' then 'text/csv'
    when 'gedcom_551' then 'text/plain' when 'gedcom_7' then 'text/plain'
    when 'pdf' then 'application/pdf' when 'svg' then 'image/svg+xml' else null end;
  v_sidecar:=v_name='phan-gia-pha-'||p_job_id::text||'-sidecar.json'
    and v_path=v_job.tree_id::text||'/'||p_job_id::text||'/sidecar.json'
    and v_type='application/json' and v_job.format in ('gedcom_551','gedcom_7');
  if (v_name<>'phan-gia-pha-'||p_job_id::text||'-primary.'||v_ext
      or v_path<>v_job.tree_id::text||'/'||p_job_id::text||'/primary.'||v_ext or v_type<>v_expected_mime)
    and not v_sidecar then
    raise exception using errcode='22023',message='artifact path or format mismatch'; end if;
  if v_ext is null or v_digest !~ '^[a-f0-9]{64}$' or v_size not between 1 and 104857600 then
    raise exception using errcode='22023',message='artifact metadata invalid'; end if;
  insert into private.export_artifact_entries(tree_id,job_id,lease_id,object_path,file_name,content_type,sha256,size_bytes)
    values(v_job.tree_id,p_job_id,p_lease_id,v_path,v_name,v_type,v_digest,v_size);
  return true;
end $$;

create function jobs.export_worker_artifact_stored(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_object_path text) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_updated boolean;
begin
  select * into v_job from private.export_jobs where id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.worker_id is distinct from p_worker_id
    or v_job.lease_id is distinct from p_lease_id or v_job.lease_until<=clock_timestamp() then return false; end if;
  perform private.export_worker_authorize(p_job_id);
  update private.export_artifact_entries set state='stored'
    where job_id=p_job_id and lease_id=p_lease_id and object_path=p_object_path and state='planned'
    returning true into v_updated;
  return coalesce(v_updated,false);
end $$;

create function jobs.export_complete(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_manifest jsonb,p_warnings jsonb) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_count integer; v_primary integer; v_sidecar integer; v_size bigint;
begin
  select * into v_job from private.export_jobs where id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.worker_id is distinct from p_worker_id
    or v_job.lease_id is distinct from p_lease_id or v_job.lease_until<=clock_timestamp() then return false; end if;
  perform private.export_worker_authorize(p_job_id);
  if p_manifest is null or jsonb_typeof(p_manifest)<>'array' or jsonb_array_length(p_manifest) not between 1 and 2
    or p_warnings is null or jsonb_typeof(p_warnings)<>'array' or jsonb_array_length(p_warnings)>200
    or exists(select 1 from jsonb_array_elements(p_warnings) w where jsonb_typeof(w)<>'string' or length(w#>>'{}')>200) then
    raise exception using errcode='22023',message='invalid completion manifest'; end if;
  select count(*),count(*) filter(where e.file_name like '%-primary.%'),count(*) filter(where e.file_name like '%-sidecar.json'),coalesce(sum(e.size_bytes),0)
    into v_count,v_primary,v_sidecar,v_size from private.export_artifact_entries e
    where e.job_id=p_job_id and e.lease_id=p_lease_id and e.state='stored';
  if v_count<>jsonb_array_length(p_manifest) or v_primary<>1 or v_size>104857600
    or (v_job.format in ('gedcom_551','gedcom_7') and v_sidecar<>1)
    or (v_job.format not in ('gedcom_551','gedcom_7') and v_sidecar<>0)
    or exists(select 1 from jsonb_array_elements(p_manifest) m where
      (select count(*) from jsonb_object_keys(m))<>5 or not exists(select 1 from private.export_artifact_entries e
        where e.job_id=p_job_id and e.lease_id=p_lease_id and e.state='stored'
          and e.object_path=m->>'objectPath' and e.file_name=m->>'fileName' and e.content_type=m->>'contentType'
          and e.sha256=m->>'sha256' and e.size_bytes=(m->>'sizeBytes')::bigint)) then
    raise exception using errcode='22023',message='stored objects do not match completion manifest'; end if;
  update private.export_jobs set status='complete',version=version+1,updated_at=clock_timestamp(),
    artifact_manifest=p_manifest,warnings=p_warnings,last_error_code=null
    where id=p_job_id and status='running' and worker_id=p_worker_id and lease_id=p_lease_id and lease_until>clock_timestamp();
  if not found then return false; end if;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_job.requested_by,'export.completed','export_job',p_job_id,gen_random_uuid(),'Authorized private export artifact manifest completed');
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
    values(v_job.tree_id,'export.completed',p_job_id,v_job.version+1,'export.completed:'||v_job.tree_id::text||':'||p_job_id::text,v_job.requested_by);
  return true;
end $$;

create function jobs.export_fail(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_error_code text) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{0,99}$' then
    raise exception using errcode='22023',message='invalid machine error code'; end if;
  select * into v_job from private.export_jobs where id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.worker_id is distinct from p_worker_id
    or v_job.lease_id is distinct from p_lease_id then return false; end if;
  begin perform private.export_worker_authorize(p_job_id);
  exception when insufficient_privilege then
    update private.export_jobs set status='cancelled',version=version+1,updated_at=clock_timestamp(),
      result_asset_id=null,last_error_code='AUTHORIZATION_REVOKED',lease_until=null where id=p_job_id;
    insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
      values(v_job.tree_id,v_job.requested_by,'export.cancelled_by_policy','export_job',p_job_id,gen_random_uuid(),
        'Export failed after its initiating session or current permission was revoked');
    return false;
  end;
  update private.export_jobs set status='failed',version=version+1,updated_at=clock_timestamp(),
    last_error_code=p_error_code,lease_until=null where id=p_job_id
      and status='running' and worker_id=p_worker_id and lease_id=p_lease_id;
  if not found then return false; end if;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_job.requested_by,'export.failed','export_job',p_job_id,gen_random_uuid(),'Private export worker failed with a non-PII error code');
  return true;
end $$;

create function jobs.export_cleanup_authorize(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_paths text[]) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_count integer;
begin
  select * into v_job from private.export_jobs where id=p_job_id;
  if not found or v_job.worker_id is distinct from p_worker_id or v_job.lease_id is distinct from p_lease_id
    or v_job.status not in ('running','cancelled','failed') or p_paths is null or cardinality(p_paths)>2 then return false; end if;
  select count(distinct e.object_path) into v_count from private.export_artifact_entries e
    where e.job_id=p_job_id and e.tree_id=v_job.tree_id and e.object_path=any(p_paths)
      and e.object_path like v_job.tree_id::text||'/'||p_job_id::text||'/%';
  return v_count=cardinality(p_paths);
end $$;

create or replace function jobs.export_cleanup_complete(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_paths text[]) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
  if not jobs.export_cleanup_authorize(p_job_id,p_worker_id,p_lease_id,p_paths) then return false; end if;
  delete from private.export_artifact_entries where job_id=p_job_id and object_path=any(p_paths);
  update private.outbox set status='published',published_at=coalesce(published_at,clock_timestamp()),claimed_by=null,claimed_at=null,lease_until=null
    where resource_id=p_job_id and event_type='export.cleanup_requested' and dedupe_key like 'export.cleanup:%:'||p_lease_id::text;
  return true;
end $$;

create function private.export_download_manifest(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype;
begin
  perform private.export_job_state(p_job_id);
  select * into v_job from private.export_jobs where id=p_job_id;
  if v_job.status<>'complete' or jsonb_array_length(v_job.artifact_manifest)=0 then
    raise exception using errcode='42501',message='export artifact unavailable'; end if;
  return jsonb_build_object('files',v_job.artifact_manifest);
end $$;
create function api.export_download_manifest(p_job_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.export_download_manifest(p_job_id); $$;

create function private.export_storage_select_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_tree uuid; v_job uuid; v_row private.export_jobs%rowtype;
begin
  if auth.uid() is null or p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(primary\.(json|csv|ged|pdf|svg)|sidecar\.json)$' then return false; end if;
  v_tree:=split_part(p_name,'/',1)::uuid; v_job:=split_part(p_name,'/',2)::uuid;
  select * into v_row from private.export_jobs j where j.id=v_job and j.tree_id=v_tree
    and j.requested_by=auth.uid() and j.status='complete' and j.expires_at>clock_timestamp()
    and exists(select 1 from jsonb_array_elements(j.artifact_manifest) a where a->>'objectPath'=p_name);
  if not found then return false; end if;
  begin perform private.export_job_state(v_job); exception when insufficient_privilege then return false; end;
  return true;
exception when invalid_text_representation then return false;
end $$;

drop policy if exists export_artifacts_select on storage.objects;
create policy export_artifacts_select on storage.objects for select to authenticated
  using (bucket_id='export-artifacts' and private.export_storage_select_allowed(name));

create function api.export_worker_claim(p_worker_id uuid,p_lease_seconds integer default 120) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_claim(p_worker_id,p_lease_seconds); $$;
create function api.export_worker_projection(p_job_id uuid,p_worker_id uuid,p_lease_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_worker_projection(p_job_id,p_worker_id,p_lease_id); $$;
create function api.export_worker_authorize_artifact(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_artifact jsonb) returns boolean
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_worker_authorize_artifact(p_job_id,p_worker_id,p_lease_id,p_artifact); $$;
create function api.export_worker_artifact_stored(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_object_path text) returns boolean
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_worker_artifact_stored(p_job_id,p_worker_id,p_lease_id,p_object_path); $$;
create function api.export_worker_complete(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_manifest jsonb,p_warnings jsonb) returns boolean
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_complete(p_job_id,p_worker_id,p_lease_id,p_manifest,p_warnings); $$;
create function api.export_worker_fail(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_error_code text) returns boolean
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_fail(p_job_id,p_worker_id,p_lease_id,p_error_code); $$;
create function api.export_worker_cleanup_authorize(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_paths text[]) returns boolean
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_cleanup_authorize(p_job_id,p_worker_id,p_lease_id,p_paths); $$;
create function api.export_worker_cleanup_complete(p_job_id uuid,p_worker_id uuid,p_lease_id uuid,p_paths text[]) returns boolean
language sql security invoker set search_path=pg_catalog as $$ select jobs.export_cleanup_complete(p_job_id,p_worker_id,p_lease_id,p_paths); $$;

revoke all on function private.export_bind_live_session(),private.export_session_require(uuid,uuid,text),
  private.export_worker_authorize(uuid),private.export_enqueue_requested(),private.export_enqueue_cleanup(),private.export_download_manifest(uuid),
  private.export_storage_select_allowed(text),jobs.export_claim(uuid,integer),
  jobs.export_worker_projection(uuid,uuid,uuid),jobs.export_worker_authorize_artifact(uuid,uuid,uuid,jsonb),
  jobs.export_worker_artifact_stored(uuid,uuid,uuid,text),jobs.export_complete(uuid,uuid,uuid,jsonb,jsonb),
  jobs.export_fail(uuid,uuid,uuid,text),jobs.export_cleanup_authorize(uuid,uuid,uuid,text[]),
  jobs.export_cleanup_complete(uuid,uuid,uuid,text[]),api.export_download_manifest(uuid),
  api.export_worker_claim(uuid,integer),api.export_worker_projection(uuid,uuid,uuid),
  api.export_worker_authorize_artifact(uuid,uuid,uuid,jsonb),api.export_worker_artifact_stored(uuid,uuid,uuid,text),
  api.export_worker_complete(uuid,uuid,uuid,jsonb,jsonb),api.export_worker_fail(uuid,uuid,uuid,text),
  api.export_worker_cleanup_authorize(uuid,uuid,uuid,text[]),api.export_worker_cleanup_complete(uuid,uuid,uuid,text[])
  from public,anon,authenticated,service_role;
grant execute on function private.export_storage_select_allowed(text) to authenticated;
grant execute on function private.export_download_manifest(uuid),api.export_download_manifest(uuid) to authenticated;
grant usage on schema jobs,api to service_role;
grant execute on function jobs.export_claim(uuid,integer),jobs.export_worker_projection(uuid,uuid,uuid),
  jobs.export_worker_authorize_artifact(uuid,uuid,uuid,jsonb),jobs.export_worker_artifact_stored(uuid,uuid,uuid,text),
  jobs.export_complete(uuid,uuid,uuid,jsonb,jsonb),jobs.export_fail(uuid,uuid,uuid,text),
  jobs.export_cleanup_authorize(uuid,uuid,uuid,text[]),jobs.export_cleanup_complete(uuid,uuid,uuid,text[])
  to service_role;
grant execute on function api.export_worker_claim(uuid,integer),api.export_worker_projection(uuid,uuid,uuid),
  api.export_worker_authorize_artifact(uuid,uuid,uuid,jsonb),api.export_worker_artifact_stored(uuid,uuid,uuid,text),
  api.export_worker_complete(uuid,uuid,uuid,jsonb,jsonb),api.export_worker_fail(uuid,uuid,uuid,text),
  api.export_worker_cleanup_authorize(uuid,uuid,uuid,text[]),api.export_worker_cleanup_complete(uuid,uuid,uuid,text[])
  to service_role;

commit;
