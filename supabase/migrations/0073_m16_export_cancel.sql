-- Cancellation changes job state only: canonical data/source media/quota are retained.
begin;
create function private.export_job_cancel(p_id uuid,p_version bigint,p_reason text,p_key uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_prior private.idempotency_records%rowtype;
  v_request jsonb; v_result jsonb;
begin
  if p_version is null or p_version<1 or p_version>9007199254740991 or p_reason is null
    or length(btrim(p_reason)) not between 5 and 1000 or p_key is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid cancellation version reason and key required'; end if;
  perform private.export_job_state(p_id);
  -- Same actor/key cannot race across different jobs; then serialize with worker completion.
  perform pg_advisory_xact_lock(hashtextextended('export-cancel:'||auth.uid()::text||':'||p_key::text,0));
  select * into v_job from private.export_jobs where id=p_id for update;
  perform private.export_job_state(p_id); -- recheck current permission/expiry/policy after waiting
  v_request:=jsonb_build_object('jobId',p_id,'baseVersion',p_version,
    'reasonDigest',encode(extensions.digest(btrim(p_reason),'sha256'),'hex'));
  select * into v_prior from private.idempotency_records where tree_id=v_job.tree_id and actor_id=auth.uid()
    and operation='export.cancel' and idempotency_key=p_key and expires_at>clock_timestamp() for update;
  if found then
    if v_prior.request_hash<>p_hash or v_prior.response->'request' is distinct from v_request then
      raise exception using errcode='P0008',message='cancellation replay payload changed'; end if;
    return v_prior.response->'job';
  end if;
  if v_job.version<>p_version or v_job.status not in ('queued','running') then
    raise exception using errcode='40001',message='export changed or no longer cancellable'; end if;
  update private.export_jobs set status='cancelled',version=version+1,updated_at=clock_timestamp(),result_asset_id=null where id=p_id;
  v_result:=private.export_job_state(p_id);
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(v_job.tree_id,auth.uid(),'export.cancel',p_key,p_hash,jsonb_build_object('job',v_result,'request',v_request),v_job.expires_at);
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(v_job.tree_id,auth.uid(),'export.cancelled','export_job',p_id,gen_random_uuid(),'Private export cancelled; no canonical data or source media deleted');
  return v_result;
end $$;
create function api.export_job_cancel(p_id uuid,p_version bigint,p_reason text,p_key uuid,p_hash text) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.export_job_cancel(p_id,p_version,p_reason,p_key,p_hash); $$;
revoke all on function private.export_job_cancel(uuid,bigint,text,uuid,text),api.export_job_cancel(uuid,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function private.export_job_cancel(uuid,bigint,text,uuid,text),api.export_job_cancel(uuid,bigint,text,uuid,text) to authenticated;
commit;
