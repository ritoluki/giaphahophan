-- M16-04: reversible explicit row decisions; parser status/raw remain unchanged.
begin;
create table private.import_row_decisions (
  tree_id uuid not null,
  job_id uuid not null,
  row_number integer not null,
  excluded boolean not null,
  reason text not null check(length(btrim(reason)) between 1 and 1000),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default clock_timestamp(),
  primary key(tree_id,job_id,row_number),
  foreign key(tree_id,job_id,row_number) references private.import_rows(tree_id,job_id,row_number) on delete cascade
);
alter table private.import_row_decisions enable row level security;
alter table private.import_row_decisions force row level security;
revoke all on private.import_row_decisions from public,anon,authenticated;

-- Unchanged batches keep the earlier hash, including already-reviewed jobs.
-- Decision reason/content is private, but is bound into every reviewed snapshot.
create or replace function private.import_current_snapshot(p_job_id uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  with raw as (
    select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('rowNumber',r.row_number,
      'externalId',r.external_id,'rawPayload',r.raw_payload,'normalized',r.normalized,'status',r.status,'errors',r.errors)
      order by r.row_number)::text,'[]'),'sha256'),'hex') as hash
      from private.import_rows r where r.job_id=p_job_id
  ), decisions as (
    select jsonb_agg(jsonb_build_object('rowNumber',d.row_number,'excluded',d.excluded,'reason',d.reason,
      'decidedBy',d.decided_by,'decidedAt',d.decided_at) order by d.row_number) as value
      from private.import_row_decisions d where d.job_id=p_job_id
  )
  select case when decisions.value is null then raw.hash
    else encode(extensions.digest(raw.hash||':'||decisions.value::text,'sha256'),'hex') end from raw,decisions;
$$;
revoke all on function private.import_current_snapshot(uuid) from public,anon,authenticated;

create or replace function private.import_excluded_count(p_job_id uuid)
returns bigint language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_tree uuid;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select tree_id into v_tree from private.import_jobs where id=p_job_id;
  if v_tree is null or not private.has_capability(v_tree,'imports.manage',null) then raise exception using errcode='42501',message='import unavailable'; end if;
  perform private.import_require_demo_tree(v_tree);
  return (select count(*) from private.import_row_decisions d where d.job_id=p_job_id and d.excluded);
end;
$$;
revoke all on function private.import_excluded_count(uuid) from public,anon,authenticated;
grant execute on function private.import_excluded_count(uuid) to authenticated;

create or replace function api.import_preview(p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
as $$
declare v_result jsonb;
begin
  perform private.import_require_demo_job(p_job_id);
  v_result:=private.import_preview(p_job_id);
  return v_result||jsonb_build_object('excluded',private.import_excluded_count(p_job_id),
    'sampleRows',coalesce((select jsonb_agg(item||jsonb_build_object('excluded',
      private.import_row_is_excluded(p_job_id,(item->>'rowNumber')::integer)) order by (item->>'rowNumber')::integer)
      from jsonb_array_elements(v_result->'sampleRows') item),'[]'::jsonb));
end;
$$;

create or replace function private.import_row_is_excluded(p_job_id uuid,p_row_number integer)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_tree uuid;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select tree_id into v_tree from private.import_jobs where id=p_job_id;
  if v_tree is null or not private.has_capability(v_tree,'imports.manage',null) then
    raise exception using errcode='42501',message='import unavailable'; end if;
  perform private.import_require_demo_tree(v_tree);
  return exists(select 1 from private.import_row_decisions d where d.job_id=p_job_id and d.row_number=p_row_number and d.excluded);
end;
$$;
revoke all on function private.import_row_is_excluded(uuid,integer) from public,anon,authenticated;
grant execute on function private.import_row_is_excluded(uuid,integer) to authenticated;

create or replace function private.import_row_decide(p_job_id uuid,p_base_version bigint,p_snapshot_hash text,
  p_row_number integer,p_excluded boolean,p_reason text,p_key uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_job private.import_jobs%rowtype; v_actor uuid:=auth.uid(); v_existing private.idempotency_records%rowtype;
  v_valid bigint; v_invalid bigint; v_review bigint; v_excluded bigint; v_snapshot text; v_request jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) or not private.has_mfa() then
    raise exception using errcode='42501',message='MFA and imports.manage required'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if p_base_version is null or p_base_version<1 or p_snapshot_hash is null or p_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_row_number is null or p_row_number not between 1 and 10000 or p_excluded is null
     or p_reason is null or length(btrim(p_reason)) not between 1 and 1000
     or p_key is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='invalid row decision'; end if;
  v_request:=jsonb_build_object('jobId',p_job_id,'baseVersion',p_base_version,'snapshotHash',p_snapshot_hash,
    'rowNumber',p_row_number,'excluded',p_excluded,'reason',btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended(v_job.tree_id::text||':'||v_actor::text||':import.row:'||p_key::text,0));
  select * into v_existing from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
    and r.operation='import.row' and r.idempotency_key=p_key and r.expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash is distinct from p_hash or v_existing.response->'request' is distinct from v_request then
      raise exception using errcode='P0008',message='row decision replay mismatch'; end if;
    return api.import_preview(p_job_id);
  end if;
  if v_job.status not in ('needs_review','ready') or v_job.version<>p_base_version
     or v_job.manifest->>'previewHash' is distinct from p_snapshot_hash
     or private.import_current_snapshot(p_job_id) is distinct from p_snapshot_hash then
    raise exception using errcode='40001',message='import preview changed'; end if;
  perform 1 from private.import_rows r where r.job_id=p_job_id and r.row_number=p_row_number for update;
  if not found then raise exception using errcode='P0002',message='staged row unavailable'; end if;
  insert into private.import_row_decisions(tree_id,job_id,row_number,excluded,reason,decided_by)
    values(v_job.tree_id,p_job_id,p_row_number,p_excluded,btrim(p_reason),v_actor)
    on conflict(tree_id,job_id,row_number) do update set excluded=excluded.excluded,reason=excluded.reason,
      decided_by=excluded.decided_by,decided_at=clock_timestamp();
  select count(*) filter(where r.status='valid' and not coalesce(d.excluded,false)),
    count(*) filter(where r.status='invalid' and not coalesce(d.excluded,false)),
    count(*) filter(where r.status='review' and not coalesce(d.excluded,false)),
    count(*) filter(where coalesce(d.excluded,false))
    into v_valid,v_invalid,v_review,v_excluded from private.import_rows r
      left join private.import_row_decisions d on d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number
      where r.job_id=p_job_id;
  v_snapshot:=private.import_current_snapshot(p_job_id);
  update private.import_jobs set status='needs_review',version=private.import_jobs.version+1,
    approval_id=null,approval_hash=null,
    counters=jsonb_build_object('processed',v_valid+v_invalid+v_review+v_excluded,'succeeded',v_valid,'failed',v_invalid,'skipped',v_review+v_excluded),
    manifest=(manifest-'reviewerId'-'reviewedVersion'-'reviewedSnapshotHash')||
      jsonb_build_object('previewHash',v_snapshot,'valid',v_valid,'invalid',v_invalid,'possibleDuplicates',v_review,'excluded',v_excluded)
    where id=p_job_id;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.row_decided','import',p_job_id,gen_random_uuid(),'Private staged-row decision changed; prior approval invalidated');
  delete from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
    and r.operation='import.row' and r.idempotency_key=p_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,v_actor,'import.row',p_key,p_hash,jsonb_build_object('request',v_request),clock_timestamp()+interval '24 hours');
  return api.import_preview(p_job_id);
end;
$$;
create or replace function api.import_row_decide(p_job_id uuid,p_base_version bigint,p_snapshot_hash text,
  p_row_number integer,p_excluded boolean,p_reason text,p_key uuid,p_hash text)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.import_row_decide($1,$2,$3,$4,$5,$6,$7,$8); $$;
revoke all on function private.import_row_decide(uuid,bigint,text,integer,boolean,text,uuid,text),
  api.import_row_decide(uuid,bigint,text,integer,boolean,text,uuid,text) from public,anon,authenticated;
grant execute on function private.import_row_decide(uuid,bigint,text,integer,boolean,text,uuid,text),
  api.import_row_decide(uuid,bigint,text,integer,boolean,text,uuid,text) to authenticated;

create or replace function private.import_review(p_job_id uuid,p_expected_version bigint,p_snapshot_hash text)
returns table(job_id uuid,version bigint,status text,approval_hash text)
language plpgsql security definer set search_path=pg_catalog,private,extensions
as $$
declare v_actor uuid:=auth.uid(); v_job private.import_jobs%rowtype; v_hash text;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_expected_version is null or p_expected_version<1 or p_snapshot_hash is null or p_snapshot_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid review version and snapshot required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then raise exception using errcode='42501',message='import review unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if not private.has_mfa() then raise exception using errcode='42501',message='MFA required for import review'; end if;
  if v_actor=v_job.created_by then raise exception using errcode='42501',message='import creator cannot review own batch'; end if;
  if v_job.version<>p_expected_version or v_job.status<>'needs_review'
     or v_job.manifest->>'previewHash' is distinct from p_snapshot_hash
     or private.import_current_snapshot(v_job.id) is distinct from p_snapshot_hash then
    raise exception using errcode='40001',message='import preview changed; reload before review';
  end if;
  if coalesce((v_job.manifest->>'valid')::integer,0)<1
     or coalesce((v_job.manifest->>'invalid')::integer,0)>0
     or coalesce((v_job.manifest->>'possibleDuplicates')::integer,0)>0
     or coalesce((v_job.manifest->>'valid')::integer,0)>2000
     or exists(select 1 from private.import_rows r where r.job_id=v_job.id and not exists(select 1 from private.import_row_decisions d where d.job_id=r.job_id and d.row_number=r.row_number and d.excluded) and r.status<>'valid')
     or exists(select 1 from private.import_rows r where r.job_id=v_job.id and not exists(select 1 from private.import_row_decisions d where d.job_id=r.job_id and d.row_number=r.row_number and d.excluded)
       and coalesce(r.normalized->>'recordType','INDI') not in ('INDI','PERSON')) then
    raise exception using errcode='22023',message='batch contains rows outside the supported person-only apply scope';
  end if;
  v_hash:=encode(extensions.digest(concat_ws(':',v_job.id,v_job.version,v_job.file_sha256,p_snapshot_hash,v_actor),'sha256'),'hex');
  update private.import_jobs set status='ready',version=private.import_jobs.version+1,approval_hash=v_hash,approval_id=gen_random_uuid(),
    manifest=manifest||jsonb_build_object('reviewerId',v_actor,'reviewedVersion',v_job.version,'reviewedSnapshotHash',p_snapshot_hash)
    where id=v_job.id returning * into v_job;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.reviewed','import',v_job.id,gen_random_uuid(),'Synthetic demo import approved after independent MFA review');
  return query select v_job.id,v_job.version,v_job.status,v_job.approval_hash;
end;
$$;

create or replace function private.import_apply(p_job_id uuid,p_expected_version bigint,p_approval_hash text,p_idempotency_key uuid,p_request_hash text)
returns table(job_id uuid,version bigint,status text,applied_people bigint,source_id uuid)
language plpgsql security definer set search_path=pg_catalog,private,extensions
as $$
declare
  v_actor uuid:=auth.uid(); v_job private.import_jobs%rowtype; v_row private.import_rows%rowtype;
  v_existing private.idempotency_records%rowtype; v_source uuid:=gen_random_uuid(); v_person uuid; v_count bigint:=0;
  v_gender text; v_record_type text; v_fact uuid;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_expected_version is null or p_expected_version<1 or p_approval_hash is null or p_approval_hash !~ '^[a-f0-9]{64}$'
     or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid apply version, approval and idempotency required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then raise exception using errcode='42501',message='import apply unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if not private.has_mfa() then raise exception using errcode='42501',message='MFA required for import apply'; end if;
  -- Completed replay is read-only: bind it to this actor, job, original version,
  -- approval and exact request. Fresh writes still pass every guard below.
  if v_job.status='completed' then
    select * into v_existing from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
      and r.operation='import.apply' and r.idempotency_key=p_idempotency_key and r.expires_at>clock_timestamp() for update;
    if not found or v_existing.request_hash is distinct from p_request_hash
       or v_existing.response->>'jobId' is distinct from v_job.id::text
       or v_existing.response->>'version' is distinct from v_job.version::text
       or v_existing.response->>'status' is distinct from 'completed'
       or v_job.approval_hash is distinct from p_approval_hash
       or v_job.manifest->>'appliedBaseVersion' is distinct from p_expected_version::text then
      raise exception using errcode='P0008',message='completed import replay does not match the original request';
    end if;
    return query select v_job.id,v_job.version,v_job.status,
      (v_existing.response->>'appliedPeople')::bigint,(v_existing.response->>'sourceId')::uuid;
    return;
  end if;
  if v_job.version<>p_expected_version then raise exception using errcode='40001',message='import job version changed'; end if;
  if v_job.status<>'ready' then raise exception using errcode='40001',message='import is not approved for apply'; end if;
  if v_job.approval_hash is distinct from p_approval_hash then raise exception using errcode='40001',message='import approval token is invalid'; end if;
  if v_job.manifest->>'reviewerId' is null or (v_job.manifest->>'reviewerId')::uuid=v_actor then
    raise exception using errcode='40001',message='independent reviewer is required'; end if;
  if v_job.manifest->>'reviewedSnapshotHash' is distinct from v_job.manifest->>'previewHash' then
    raise exception using errcode='40001',message='reviewed preview changed'; end if;
  if private.import_current_snapshot(v_job.id) is distinct from v_job.manifest->>'reviewedSnapshotHash' then
    raise exception using errcode='40001',message='reviewed staging rows changed'; end if;
  perform 1 from private.media_assets m where m.id=v_job.source_asset_id and m.tree_id=v_job.tree_id
     and m.purpose='import' and m.state='ready' and m.actual_sha256=v_job.file_sha256 and m.expected_sha256=v_job.file_sha256 for share;
  if not found then
    raise exception using errcode='40001',message='approved import source is no longer ready'; end if;
  if (v_job.manifest->>'reviewedVersion')::bigint<>v_job.version-1 then
    raise exception using errcode='40001',message='reviewed job version changed'; end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash),'') is null then raise exception using errcode='22023',message='idempotency key and request hash required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_job.tree_id::text||':'||v_actor::text||':import.apply:'||p_idempotency_key::text,0));
  select * into v_existing from private.idempotency_records where tree_id=v_job.tree_id and actor_id=v_actor
    and operation='import.apply' and idempotency_key=p_idempotency_key and expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash<>p_request_hash then raise exception using errcode='P0008',message='idempotency key request mismatch'; end if;
    return query select (v_existing.response->>'jobId')::uuid,(v_existing.response->>'version')::bigint,
      v_existing.response->>'status',(v_existing.response->>'appliedPeople')::bigint,(v_existing.response->>'sourceId')::uuid; return;
  end if;
  if v_job.status<>'ready' or v_job.version<>p_expected_version then raise exception using errcode='40001',message='import job changed'; end if;
  update private.import_jobs set status='applying',version=private.import_jobs.version+1 where id=v_job.id returning * into v_job;
  insert into private.sources(id,tree_id,created_by,title,kind,provenance,visibility,rights_note,provider_name,original_asset_id)
    values(v_source,v_job.tree_id,v_actor,'Nguồn nhập demo · '||left(v_job.file_sha256,12),'document',
      'Nhập từ batch '||v_job.id||'; SHA-256 '||v_job.file_sha256,'restricted','Synthetic demo import; original retained in private storage',v_job.source_namespace,v_job.source_asset_id);
  for v_row in select r.* from private.import_rows as r where r.job_id=v_job.id and not exists(select 1 from private.import_row_decisions d where d.job_id=r.job_id and d.row_number=r.row_number and d.excluded) order by r.row_number for update loop
    v_record_type:=coalesce(v_row.normalized->>'recordType','INDI');
    if v_row.status<>'valid' or v_record_type not in ('INDI','PERSON') then raise exception using errcode='22023',message='unsupported or unreviewed import row'; end if;
    if not private.import_date_valid(v_row.normalized->'birthDate') or not private.import_date_valid(v_row.normalized->'deathDate') then
      raise exception using errcode='22023',message='invalid normalized genealogy date'; end if;
    if coalesce(v_row.normalized->'familyChildRefs','[]'::jsonb)<>'[]'::jsonb
       or coalesce(v_row.normalized->'familySpouseRefs','[]'::jsonb)<>'[]'::jsonb then
      raise exception using errcode='22023',message='relationship mapping requires explicit review'; end if;
    if jsonb_typeof(v_row.normalized->'displayName') is distinct from 'string'
       or length(btrim(v_row.normalized->>'displayName')) not between 1 and 300
       or v_row.external_id is null or v_row.normalized->>'externalId' is distinct from v_row.external_id then
      raise exception using errcode='22023',message='invalid normalized person identity'; end if;
    select canonical_id into v_person from private.external_id_map where tree_id=v_job.tree_id
      and source_namespace=v_job.source_namespace and external_id=v_row.external_id and entity_kind='person' for update;
    if v_person is null then raise exception using errcode='23503',message='stable person identity mapping missing'; end if;
    if exists(select 1 from private.persons where tree_id=v_job.tree_id and id=v_person) then
      raise exception using errcode='23505',message='mapped canonical person already exists; merge/update requires separate review';
    end if;
    v_gender:=case upper(coalesce(v_row.normalized->>'gender',v_row.normalized->>'sex','')) when 'M' then 'M' when 'F' then 'F' when 'X' then 'X' when 'U' then 'U' else null end;
    insert into private.persons(id,tree_id,created_by,code,display_name,name_search,recorded_sex,life_status,visibility,biography,confidence)
      values(v_person,v_job.tree_id,v_actor,'IMP-'||upper(substr(replace(v_person::text,'-',''),1,12)),
        left(btrim(v_row.normalized->>'displayName'),300),private.normalize_name_search(left(btrim(v_row.normalized->>'displayName'),300)),
        v_gender,'unknown','restricted',null,'unverified');
    insert into private.person_names(tree_id,created_by,person_id,name,name_search,kind,is_preferred)
      values(v_job.tree_id,v_actor,v_person,left(btrim(v_row.normalized->>'displayName'),300),
        private.normalize_name_search(left(btrim(v_row.normalized->>'displayName'),300)),'birth',true);
    if jsonb_typeof(v_row.normalized->'birthDate')='object' then
      insert into private.person_facts(tree_id,created_by,person_id,kind,value_date,confidence,visibility)
        values(v_job.tree_id,v_actor,v_person,'birth',v_row.normalized->'birthDate','unverified','restricted') returning id into v_fact;
      insert into private.citations(tree_id,created_by,source_id,fact_id,locator,confidence)
        values(v_job.tree_id,v_actor,v_source,v_fact,'Dòng nguồn '||v_row.row_number||' · ngày sinh','unverified');
    end if;
    if jsonb_typeof(v_row.normalized->'deathDate')='object' then
      insert into private.person_facts(tree_id,created_by,person_id,kind,value_date,confidence,visibility)
        values(v_job.tree_id,v_actor,v_person,'death',v_row.normalized->'deathDate','unverified','restricted') returning id into v_fact;
      insert into private.citations(tree_id,created_by,source_id,fact_id,locator,confidence)
        values(v_job.tree_id,v_actor,v_source,v_fact,'Dòng nguồn '||v_row.row_number||' · ngày mất','unverified');
    end if;
    insert into private.citations(tree_id,created_by,source_id,person_id,locator,confidence)
      values(v_job.tree_id,v_actor,v_source,v_person,'Dòng nguồn '||v_row.row_number,'unverified');
    v_count:=v_count+1;
  end loop;
  update private.import_jobs set status='completed',version=private.import_jobs.version+1,
    counters=jsonb_build_object('processed',v_count+coalesce((v_job.manifest->>'excluded')::bigint,0),'succeeded',v_count,'failed',0,'skipped',coalesce((v_job.manifest->>'excluded')::bigint,0)),
    manifest=manifest||jsonb_build_object('appliedPeople',v_count,'sourceId',v_source,'appliedBy',v_actor,'appliedBaseVersion',p_expected_version,'completedAt',clock_timestamp(),
      'appliedEntities',(select jsonb_agg(jsonb_build_object('rowNumber',r.row_number,'personId',m.canonical_id,'baseVersion',1) order by r.row_number)
        from private.import_rows r join private.external_id_map m on m.tree_id=r.tree_id and m.external_id=r.external_id
        and m.source_namespace=v_job.source_namespace and m.entity_kind='person' where r.job_id=v_job.id and not exists(select 1 from private.import_row_decisions d where d.job_id=r.job_id and d.row_number=r.row_number and d.excluded)))
    where id=v_job.id returning * into v_job;
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,v_actor,'import.apply',p_idempotency_key,p_request_hash,
      jsonb_build_object('jobId',v_job.id,'version',v_job.version,'status',v_job.status,'appliedPeople',v_count,'sourceId',v_source),clock_timestamp()+interval '24 hours');
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.applied','import',v_job.id,gen_random_uuid(),'Approved synthetic demo people and source citations applied atomically');
  insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
    values(v_job.tree_id,'import.completed',v_job.id,v_job.version,'import.completed:'||v_job.id,v_actor) on conflict(dedupe_key) do nothing;
  return query select v_job.id,v_job.version,v_job.status,v_count,v_source;
end;
$$;
revoke all on function private.import_review(uuid,bigint,text),private.import_apply(uuid,bigint,text,uuid,text) from public,anon,authenticated;
commit;
