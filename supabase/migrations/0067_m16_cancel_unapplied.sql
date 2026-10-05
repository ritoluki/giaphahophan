-- M16-05 first vertical slice: safely cancel a reviewed batch before canonical writes.
begin;

create or replace function private.import_cancel(
  p_job_id uuid,p_expected_version bigint,p_reason text,p_idempotency_key uuid,p_request_hash text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,extensions
as $$
declare
  v_actor uuid:=auth.uid();
  v_job private.import_jobs%rowtype;
  v_existing private.idempotency_records%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  if p_expected_version is null or p_expected_version<1 or p_reason is null or length(btrim(p_reason)) not between 5 and 1000
     or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid cancel version, reason and idempotency required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id for update;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import cancellation unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  if not private.has_mfa() then raise exception using errcode='42501',message='MFA required for import cancellation'; end if;

  select * into v_existing from private.idempotency_records r where r.tree_id=v_job.tree_id and r.actor_id=v_actor
    and r.operation='import.cancel' and r.idempotency_key=p_idempotency_key and r.expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash<>p_request_hash or v_existing.response->>'jobId'<>v_job.id::text then
      raise exception using errcode='P0008',message='cancel replay does not match the original request'; end if;
    return private.import_job_state(v_job.id)||jsonb_build_object('canCancel',false);
  end if;

  if v_job.version<>p_expected_version then raise exception using errcode='40001',message='import job version changed'; end if;
  if v_job.status not in ('needs_review','ready') then
    raise exception using errcode='40001',message='only an unapplied reviewed import can be cancelled'; end if;
  if coalesce((v_job.manifest->>'appliedPeople')::bigint,0)<>0
     or coalesce((v_job.manifest->>'appliedUnions')::bigint,0)<>0
     or coalesce((v_job.manifest->>'appliedParentLinks')::bigint,0)<>0
     or exists(select 1 from private.import_rows r join private.external_id_map m on m.tree_id=r.tree_id
       and m.source_namespace=v_job.source_namespace and m.external_id=r.external_id
       and m.entity_kind=case when r.normalized->>'recordType'='FAM' then 'family' else 'person' end
       where r.tree_id=v_job.tree_id and r.job_id=v_job.id and (
         exists(select 1 from private.persons p where p.tree_id=m.tree_id and p.id=m.canonical_id)
         or exists(select 1 from private.unions u where u.tree_id=m.tree_id and u.id=m.canonical_id))) then
    raise exception using errcode='40001',message='canonical writes exist; cancellation cannot discard applied data'; end if;

  update private.import_jobs set status='cancelled',version=version+1,approval_id=null,approval_hash=null,
    manifest=manifest||jsonb_build_object('cancelledAt',clock_timestamp(),'cancelledBy',v_actor,
      'cancelReasonHash',encode(extensions.digest(btrim(p_reason),'sha256'),'hex'))
    where id=v_job.id returning * into v_job;
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,v_actor,'import.cancelled','import',v_job.id,gen_random_uuid(),'Unapplied synthetic import cancelled; reason retained as a digest only');
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,v_actor,'import.cancel',p_idempotency_key,p_request_hash,
      jsonb_build_object('jobId',v_job.id,'version',v_job.version,'status',v_job.status),clock_timestamp()+interval '24 hours');
  return private.import_job_state(v_job.id)||jsonb_build_object('canCancel',false);
end;
$$;

create or replace function api.import_cancel(p_job_id uuid,p_expected_version bigint,p_reason text,p_idempotency_key uuid,p_request_hash text)
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.import_cancel($1,$2,$3,$4,$5); $$;

revoke all on function private.import_cancel(uuid,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function private.import_cancel(uuid,bigint,text,uuid,text) to authenticated;
revoke all on function api.import_cancel(uuid,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function api.import_cancel(uuid,bigint,text,uuid,text) to authenticated;

create or replace function private.import_job_state(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private
as $$
declare v_job private.import_jobs%rowtype; v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000',message='authenticated actor required'; end if;
  select * into v_job from private.import_jobs where id=p_job_id;
  if not found or not private.has_capability(v_job.tree_id,'imports.manage',null) then
    raise exception using errcode='42501',message='import job unavailable'; end if;
  perform private.import_require_demo_tree(v_job.tree_id);
  return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'version',v_job.version,'kind','import',
    'status',v_job.status,'counters',v_job.counters,'warnings',coalesce(v_job.manifest->'warnings','[]'::jsonb),
    'errorCode',null,'expiresAt',null,'treeId',v_job.tree_id,'sourceAssetId',v_job.source_asset_id,
    'fileSha256',v_job.file_sha256,'format',v_job.format,'sourceNamespace',v_job.source_namespace,
    'mappingVersion',v_job.mapping_version,'classification',v_job.classification),
    'approvalId',v_job.approval_id,'approvedSnapshotHash',v_job.manifest->>'reviewedSnapshotHash',
    'canReview',v_job.status='needs_review' and v_actor<>v_job.created_by and private.has_mfa(),
    'canApply',v_job.status='ready' and v_actor::text is distinct from v_job.manifest->>'reviewerId' and private.has_mfa(),
    'canCancel',v_job.status in ('needs_review','ready') and private.has_mfa(),
    'appliedPeople',coalesce((v_job.manifest->>'appliedPeople')::bigint,0),
    'appliedUnions',coalesce((v_job.manifest->>'appliedUnions')::bigint,0),
    'appliedParentLinks',coalesce((v_job.manifest->>'appliedParentLinks')::bigint,0));
end;
$$;

create or replace function api.import_job_state(p_job_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.import_job_state($1); $$;
revoke all on function api.import_job_state(uuid) from public,anon,authenticated;
grant execute on function api.import_job_state(uuid) to authenticated;

commit;
