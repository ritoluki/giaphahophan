-- M16-05: separate two-person compensation; exact created-row snapshots only.
begin;
create table private.import_compensation_requests (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null,
  job_id uuid not null,
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  base_job_version bigint not null,
  scope_hash text not null check(scope_hash ~ '^[a-f0-9]{64}$'),
  counts jsonb not null,
  reason text not null check(length(btrim(reason)) between 5 and 1000),
  status text not null default 'pending' check(status in ('pending','approved','completed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  completed_at timestamptz,
  foreign key(tree_id,job_id) references private.import_jobs(tree_id,id) on delete cascade,
  check(status='pending' or (reviewed_by is not null and reviewed_by<>created_by and reviewed_at is not null)),
  check(status<>'completed' or completed_at is not null)
);
alter table private.import_compensation_requests enable row level security;
alter table private.import_compensation_requests force row level security;
revoke all on private.import_compensation_requests from public,anon,authenticated;
create index import_compensation_job_idx on private.import_compensation_requests(job_id,created_at desc,id);

create function private.import_owned_scope_hash(p_job_id uuid) returns text
language sql stable security definer set search_path=pg_catalog as $$
  select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('table',o.table_name,'id',o.entity_id,'row',o.row_snapshot)
    order by o.table_name,o.entity_id)::text,'[]'),'sha256'),'hex') from private.import_owned_rows o where o.job_id=$1;
$$;
create function private.import_owned_counts(p_job_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('people',count(*) filter(where table_name='persons'),'unions',count(*) filter(where table_name='unions'),
    'parentLinks',count(*) filter(where table_name='parent_links'),'facts',count(*) filter(where table_name='person_facts'),
    'citations',count(*) filter(where table_name='citations')) from private.import_owned_rows where job_id=$1;
$$;

-- Include normal FKs AND polymorphic/JSON references (proposals, content and pending workflows).
-- Audits/ledger/staging and stable identity reservations are retained as historical evidence.
create function private.import_has_new_references(p_job_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare v_table text; v_found boolean; v_candidates text;
begin
  for v_table in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r' and c.relname not in (
      'audit_events','outbox','idempotency_records','external_id_map','import_jobs','import_rows','import_row_decisions',
      'import_relationship_mappings','import_chunks','import_owned_rows','import_compensation_requests')
    order by c.relname
  loop
    if v_table in ('sources','persons','person_names','person_facts','unions','union_partners','union_children','parent_links','citations') then
      v_candidates:=format('select to_jsonb(t)::text payload from private.%I t left join private.import_owned_rows own
        on own.job_id=$1 and own.table_name=$2 and own.entity_id=t.id and own.tree_id=t.tree_id
        where own.entity_id is null',v_table);
    else
      v_candidates:=format('select to_jsonb(t)::text payload from private.%I t',v_table);
    end if;
    -- Filter owned rows by typed UUID joins before expanding payloads; hash-join target IDs once.
    execute 'with candidates as materialized ('||v_candidates||'), owned as materialized (
      select distinct entity_id::text id from private.import_owned_rows where job_id=$1)
      select exists(select 1 from candidates c cross join lateral regexp_matches(c.payload,
        ''([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'',''gi'') reference
        join owned o on o.id=lower(reference[1]))' into v_found using p_job_id,v_table;
    if v_found then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function private.import_owned_scope_hash(uuid),private.import_owned_counts(uuid),private.import_has_new_references(uuid) from public,anon,authenticated;

create function private.import_compensation_state(p_job_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_job private.import_jobs%rowtype; v_review private.import_compensation_requests%rowtype; v_actor uuid:=auth.uid();
begin
  select * into strict v_job from private.import_jobs where id=p_job_id;
  select * into v_review from private.import_compensation_requests r where r.job_id=p_job_id order by r.created_at desc,r.id limit 1;
  return jsonb_build_object('canRequestCompensation',private.has_mfa() and v_job.status in ('partially_applied','completed','cancelled')
    and v_job.manifest->>'compensatedAt' is null and coalesce((v_job.manifest->>'appliedPeople')::bigint,0)>0
    and exists(select 1 from private.import_owned_rows where job_id=p_job_id),
    'compensation',case when v_review.id is null then null else jsonb_build_object('id',v_review.id,'version',v_review.version,
      'status',v_review.status,'baseJobVersion',v_review.base_job_version,'reason',v_review.reason,'counts',v_review.counts,
      'canApprove',private.has_mfa() and v_review.status='pending' and v_actor<>v_review.created_by and v_job.version=v_review.base_job_version,
      'canCommit',private.has_mfa() and v_review.status='approved' and v_actor=v_review.created_by and v_actor<>v_review.reviewed_by
        and v_job.version=v_review.base_job_version) end);
end;
$$;
revoke all on function private.import_compensation_state(uuid) from public,anon,authenticated;

create function private.import_compensation(p_job_id uuid,p_action text,p_base_version bigint,p_review_id uuid,p_review_version bigint,
  p_reason text,p_key uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_actor uuid:=auth.uid(); v_job private.import_jobs%rowtype; v_review private.import_compensation_requests%rowtype;
  v_existing private.idempotency_records%rowtype; v_scope text; v_counts jsonb; v_table text; v_lock_tables text; v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_action is null or p_action not in ('request','approve','commit') or p_base_version is null or p_base_version<1
    or p_key is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or (p_action='request' and (p_reason is null or length(btrim(p_reason)) not between 5 and 1000 or p_review_id is not null or p_review_version is not null))
    or (p_action<>'request' and (p_review_id is null or p_review_version is null or p_review_version<1 or p_reason is not null)) then
    raise exception using errcode='22023',message='valid compensation action, versions, reason and idempotency required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) or not private.has_mfa() then
    raise exception using errcode='42501',message='MFA and imports.manage required'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);

  if p_action='commit' then
    -- Rare bulk compensation uses conservative write exclusion, including polymorphic references.
    -- Acquire this before the job row/tree lock; lock/deadlock conflicts abort without partial deletion.
    select string_agg(format('private.%I',c.relname),',' order by c.relname) into v_lock_tables
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r';
    execute 'lock table '||v_lock_tables||' in share row exclusive mode';
  end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not private.has_capability(v_job.tree_id,'imports.manage',null) or not private.has_mfa() then
    raise exception using errcode='42501',message='compensation permission changed'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  select * into v_existing from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
    and r.operation='import.compensation.'||p_action and r.idempotency_key=p_key and r.expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash<>p_hash or v_existing.response->>'jobId'<>v_job.id::text then
      raise exception using errcode='P0008',message='compensation replay changed'; end if;
    return private.import_job_state(v_job.id);
  end if;
  if v_job.version<>p_base_version or v_job.status not in ('completed','partially_applied','cancelled')
    or v_job.manifest->>'compensatedAt' is not null then
    raise exception using errcode='40001',message='compensation job version or state changed'; end if;
  v_scope:=private.import_owned_scope_hash(v_job.id); v_counts:=private.import_owned_counts(v_job.id);
  if (v_counts->>'people')::bigint<1 or not private.import_owned_rows_unchanged(v_job.id) then
    raise exception using errcode='40001',message='import-created rows are missing or changed'; end if;

  if p_action='request' then
    if private.import_has_new_references(v_job.id) then raise exception using errcode='40001',message='new references prevent compensation'; end if;
    insert into private.import_compensation_requests(tree_id,job_id,created_by,base_job_version,scope_hash,counts,reason)
      values(v_job.tree_id,v_job.id,v_actor,v_job.version,v_scope,v_counts,btrim(p_reason)) returning * into v_review;
  else
    select * into v_review from private.import_compensation_requests r where r.id=p_review_id and r.job_id=v_job.id for update;
    if not found or v_review.version<>p_review_version or v_review.base_job_version<>v_job.version or v_review.scope_hash<>v_scope then
      raise exception using errcode='40001',message='compensation review or scope changed'; end if;
    if p_action='approve' then
      if v_review.status<>'pending' or v_review.created_by=v_actor then
        raise exception using errcode='42501',message='separate compensation reviewer required'; end if;
      if private.import_has_new_references(v_job.id) then raise exception using errcode='40001',message='new references prevent approval'; end if;
      update private.import_compensation_requests set status='approved',version=version+1,reviewed_by=v_actor,reviewed_at=clock_timestamp()
        where id=v_review.id returning * into v_review;
    else
      if v_review.status<>'approved' or v_review.created_by<>v_actor or v_review.reviewed_by=v_actor then
        raise exception using errcode='42501',message='compensation requires separate approval and original requester'; end if;
      perform pg_advisory_xact_lock(hashtextextended(v_job.tree_id::text,0));
      if private.import_has_new_references(v_job.id) then raise exception using errcode='40001',message='new references prevent compensation'; end if;
      foreach v_table in array array['citations','union_partners','union_children','parent_links','person_facts','person_names','unions','persons','sources'] loop
        execute format('delete from private.%I t using private.import_owned_rows o
          where o.job_id=$1 and o.table_name=$2 and t.id=o.entity_id and t.tree_id=o.tree_id',v_table) using v_job.id,v_table;
      end loop;
      if (v_counts->>'unions')::bigint>0 or (v_counts->>'parentLinks')::bigint>0 then
        update private.trees set graph_revision=graph_revision+1 where id=v_job.tree_id;
      end if;
      update private.import_compensation_requests set status='completed',version=version+1,completed_at=clock_timestamp()
        where id=v_review.id returning * into v_review;
      update private.import_jobs set status='cancelled',version=version+1,approval_id=null,approval_hash=null,
        manifest=manifest||jsonb_build_object('compensatedAt',clock_timestamp(),'compensatedBy',v_actor,
          'compensationReviewId',v_review.id,'removedCounts',v_counts,'appliedPeople',0,'appliedUnions',0,'appliedParentLinks',0)
        where id=v_job.id returning * into v_job;
      insert into private.outbox(tree_id,event_type,resource_id,resource_version,dedupe_key,requested_by)
        values(v_job.tree_id,'import.compensated',v_job.id,v_job.version,'import.compensated:'||v_review.id,v_actor) on conflict(dedupe_key) do nothing;
    end if;
  end if;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.compensation.'||p_action,'import',v_job.id,gen_random_uuid(),
      'Synthetic compensation workflow; separate approval and unchanged created-row scope enforced');
  delete from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
    and r.operation='import.compensation.'||p_action and r.idempotency_key=p_key and r.expires_at<=clock_timestamp();
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,v_actor,'import.compensation.'||p_action,p_key,p_hash,jsonb_build_object('jobId',v_job.id,'reviewId',v_review.id),clock_timestamp()+interval '24 hours');
  return private.import_job_state(v_job.id);
end;
$$;
create function api.import_compensation(p_job_id uuid,p_action text,p_base_version bigint,p_review_id uuid,p_review_version bigint,
  p_reason text,p_key uuid,p_hash text) returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.import_compensation($1,$2,$3,$4,$5,$6,$7,$8); $$;
revoke all on function private.import_compensation(uuid,text,bigint,uuid,bigint,text,uuid,text),api.import_compensation(uuid,text,bigint,uuid,bigint,text,uuid,text)
  from public,anon,authenticated;
grant execute on function private.import_compensation(uuid,text,bigint,uuid,bigint,text,uuid,text),api.import_compensation(uuid,text,bigint,uuid,bigint,text,uuid,text) to authenticated;

-- State projection keeps private ownership snapshots out of the API.
create or replace function private.import_job_state(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private as $$
declare v_job private.import_jobs%rowtype; v_actor uuid:=auth.uid(); v_people bigint; v_total bigint; v_done bigint; v_next integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import job unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  select count(*) into v_people from private.import_rows r where r.job_id=v_job.id
    and coalesce(r.normalized->>'recordType','INDI') in ('INDI','PERSON')
    and not exists(select 1 from private.import_row_decisions d where d.tree_id=r.tree_id and d.job_id=r.job_id and d.row_number=r.row_number and d.excluded);
  select count(*),count(*) filter(where c.status='completed'),min(c.sequence) filter(where c.status='pending')
    into v_total,v_done,v_next from private.import_chunks c where c.job_id=v_job.id
    and c.approval_id=coalesce(v_job.approval_id,nullif(v_job.manifest->>'chunkApprovalId','')::uuid);
  return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'version',v_job.version,'kind','import',
    'status',v_job.status,'counters',v_job.counters,'warnings',coalesce(v_job.manifest->'warnings','[]'::jsonb),
    'errorCode',null,'expiresAt',null,'treeId',v_job.tree_id,'sourceAssetId',v_job.source_asset_id,
    'fileSha256',v_job.file_sha256,'format',v_job.format,'sourceNamespace',v_job.source_namespace,
    'mappingVersion',v_job.mapping_version,'classification',v_job.classification),
    'approvalId',v_job.approval_id,'approvedSnapshotHash',v_job.manifest->>'reviewedSnapshotHash',
    'canReview',v_job.status='needs_review' and v_actor<>v_job.created_by and private.has_mfa(),
    'canApply',v_job.status='ready' and v_people<=2000 and v_done=0 and v_actor::text is distinct from v_job.manifest->>'reviewerId' and private.has_mfa(),
    'canCancel',v_job.status in ('needs_review','ready','partially_applied') and private.has_mfa(),
    'canApplyChunk',v_job.status in ('ready','partially_applied') and v_actor::text is distinct from v_job.manifest->>'reviewerId' and private.has_mfa(),
    'chunkProgress',case when v_total>0 then jsonb_build_object('total',v_total,'committed',v_done,
      'nextSequence',case when v_job.status in ('ready','partially_applied') then v_next else null end) else null end,
    'appliedPeople',coalesce((v_job.manifest->>'appliedPeople')::bigint,0),
    'appliedUnions',coalesce((v_job.manifest->>'appliedUnions')::bigint,0),
    'appliedParentLinks',coalesce((v_job.manifest->>'appliedParentLinks')::bigint,0))||private.import_compensation_state(v_job.id);
end;
$$;
commit;
