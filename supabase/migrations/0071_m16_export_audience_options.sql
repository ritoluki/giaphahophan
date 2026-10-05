-- Preserve the approved API format labels, requested audience and media choice.
begin;
alter table private.export_jobs add column audience text not null default 'members' check(audience in ('self','members','public')),
  add column include_media boolean not null default false;
update private.export_jobs set audience='self' where scope->>'kind'='personal';
create or replace function private.export_job_state(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_policy bigint;
begin
  select * into v_job from private.export_jobs where id=p_id;
  if not found or v_job.requested_by is distinct from auth.uid() then raise exception using errcode='42501',message='export job unavailable'; end if;
  perform private.export_require_scope(v_job.tree_id,v_job.scope);
  select policy_version into v_policy from private.trees where id=v_job.tree_id;
  if v_policy<>v_job.policy_version or v_job.expires_at<=clock_timestamp() then
    raise exception using errcode='42501',message='export expired or policy changed'; end if;
  return jsonb_build_object('id',v_job.id,'treeId',v_job.tree_id,'version',v_job.version,
    'format',case v_job.format when 'json' then 'canonical_json' when 'pdf' then 'book_pdf' else v_job.format end,
    'scope',v_job.scope,'policyVersion',v_job.policy_version,'audience',v_job.audience,'includeMedia',v_job.include_media,
    'status',v_job.status,'expiresAt',v_job.expires_at,'warnings',v_job.warnings);
end $$;
create function private.export_job_create_v1(p_tree uuid,p_format text,p_scope jsonb,p_purpose text,p_key uuid,p_hash text,p_audience text,p_include_media boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_prior private.idempotency_records%rowtype; v_result jsonb; v_id uuid; v_replay boolean;
begin
  if p_audience is null or p_audience not in ('self','members','public') or p_include_media is null
    or ((p_scope->>'kind'='personal') is distinct from (p_audience='self')) then
    raise exception using errcode='22023',message='audience must match approved export scope'; end if;
  perform private.export_require_scope(p_tree,p_scope);
  perform pg_advisory_xact_lock(hashtextextended('export-quota:'||auth.uid()::text,0));
  select * into v_prior from private.idempotency_records where tree_id=p_tree and actor_id=auth.uid()
    and operation='export.create' and idempotency_key=p_key and expires_at>clock_timestamp();
  v_replay:=found;
  if v_replay and not exists(select 1 from private.export_jobs j where j.id=(v_prior.response->>'id')::uuid
    and j.audience=p_audience and j.include_media=p_include_media) then
    raise exception using errcode='P0008',message='export audience or media choice changed'; end if;
  v_result:=private.export_job_create(p_tree,p_format,p_scope,p_purpose,p_key,p_hash);
  v_id:=(v_result->>'id')::uuid;
  if not v_replay then update private.export_jobs set audience=p_audience,include_media=p_include_media where id=v_id; end if;
  return private.export_job_state(v_id);
end $$;
create function api.export_job_create_v1(p_tree uuid,p_format text,p_scope jsonb,p_purpose text,p_key uuid,p_hash text,p_audience text,p_include_media boolean) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.export_job_create_v1(p_tree,p_format,p_scope,p_purpose,p_key,p_hash,p_audience,p_include_media); $$;
revoke all on function private.export_job_create(uuid,text,jsonb,text,uuid,text),api.export_job_create(uuid,text,jsonb,text,uuid,text) from public,anon,authenticated;
revoke all on function private.export_job_create_v1(uuid,text,jsonb,text,uuid,text,text,boolean),api.export_job_create_v1(uuid,text,jsonb,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function private.export_job_create_v1(uuid,text,jsonb,text,uuid,text,text,boolean),api.export_job_create_v1(uuid,text,jsonb,text,uuid,text,text,boolean) to authenticated;
commit;
