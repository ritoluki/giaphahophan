-- M16-06 durable job metadata only. Rendering/private artifacts/download are separate gates.
begin;
create table private.export_jobs (
  id uuid primary key default gen_random_uuid(), tree_id uuid not null references private.trees(id),
  version bigint not null default 1, created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(), created_by uuid references auth.users(id),
  requested_by uuid not null references auth.users(id), purpose text not null check(length(btrim(purpose)) between 5 and 1000),
  format text not null check(format in ('json','csv','gedcom_551','gedcom_7','pdf','svg')), scope jsonb not null,
  policy_version bigint not null, status text not null default 'queued' check(status in ('queued','running','complete','failed','cancelled')),
  result_asset_id uuid, expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
  warnings jsonb not null default '[]'::jsonb check(jsonb_typeof(warnings)='array'),
  foreign key(tree_id,result_asset_id) references private.media_assets(tree_id,id), unique(tree_id,id)
);
create index export_jobs_actor_quota on private.export_jobs(requested_by,created_at);
alter table private.export_jobs enable row level security;
alter table private.export_jobs force row level security;
revoke all on private.export_jobs from public,anon,authenticated;

create function private.export_require_scope(p_tree uuid,p_scope jsonb) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare v_kind text; v_target uuid;
begin
  if auth.uid() is null or not private.is_active_member(p_tree) then
    raise exception using errcode='42501',message='active export membership required'; end if;
  -- No real-data workflow is enabled by this local implementation.
  if not exists(select 1 from private.trees where id=p_tree and data_mode='demo') then
    raise exception using errcode='42501',message='real-data export approval required'; end if;
  if p_scope is null or jsonb_typeof(p_scope)<>'object' then
    raise exception using errcode='22023',message='explicit export scope required'; end if;
  v_kind:=p_scope->>'kind';
  if v_kind='personal' then
    if (select count(*) from jsonb_object_keys(p_scope))<>2 or not p_scope ? 'personId' then
      raise exception using errcode='22023',message='invalid personal scope'; end if;
    v_target:=(p_scope->>'personId')::uuid;
    if not exists(select 1 from private.memberships m join private.persons p on p.id=m.person_id and p.tree_id=m.tree_id
      where m.tree_id=p_tree and m.auth_user_id=auth.uid() and m.status='active' and m.person_id=v_target and p.deleted_at is null
      and exists(select 1 from private.person_claims c where c.tree_id=m.tree_id and c.membership_id=m.id
        and c.person_id=p.id and c.status='approved' and c.reviewed_by is not null and c.reviewed_by<>c.created_by)) then
      raise exception using errcode='42501',message='independently approved personal scope required'; end if;
  elsif v_kind in ('tree','branch') then
    if (v_kind='tree' and p_scope<>'{"kind":"tree"}'::jsonb)
      or (v_kind='branch' and ((select count(*) from jsonb_object_keys(p_scope))<>2 or not p_scope ? 'branchId')) then
      raise exception using errcode='22023',message='invalid bulk scope'; end if;
    if v_kind='branch' then
      v_target:=(p_scope->>'branchId')::uuid;
      if not exists(select 1 from private.branches where tree_id=p_tree and id=v_target) then
        raise exception using errcode='42501',message='export scope unavailable'; end if;
    end if;
    if not private.has_capability(p_tree,'exports.bulk',v_target) or not private.has_mfa() then
      raise exception using errcode='42501',message='bulk export capability and MFA required'; end if;
  else raise exception using errcode='22023',message='unsupported export scope'; end if;
end $$;

create function private.export_job_state(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_job private.export_jobs%rowtype; v_policy bigint;
begin
  select * into v_job from private.export_jobs where id=p_id;
  if not found or v_job.requested_by is distinct from auth.uid() then
    raise exception using errcode='42501',message='export job unavailable'; end if;
  perform private.export_require_scope(v_job.tree_id,v_job.scope);
  select policy_version into v_policy from private.trees where id=v_job.tree_id;
  if v_policy<>v_job.policy_version or v_job.expires_at<=clock_timestamp() then
    raise exception using errcode='42501',message='export expired or policy changed'; end if;
  return jsonb_build_object('id',v_job.id,'treeId',v_job.tree_id,'version',v_job.version,
    'format',v_job.format,'scope',v_job.scope,'policyVersion',v_job.policy_version,
    'status',v_job.status,'expiresAt',v_job.expires_at,'warnings',v_job.warnings);
end $$;

create function private.export_job_create(p_tree uuid,p_format text,p_scope jsonb,p_purpose text,p_key uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_policy bigint; v_id uuid; v_result jsonb; v_existing private.idempotency_records%rowtype;
begin
  if p_format is null or p_format not in ('json','csv','gedcom_551','gedcom_7','pdf','svg') or p_purpose is null
    or length(btrim(p_purpose)) not between 5 and 1000 or p_key is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='valid export request and idempotency required'; end if;
  perform private.export_require_scope(p_tree,p_scope);
  -- One global per-actor quota lock, including requests across different trees.
  perform pg_advisory_xact_lock(hashtextextended('export-quota:'||v_actor::text,0));
  perform private.export_require_scope(p_tree,p_scope);
  select * into v_existing from private.idempotency_records where tree_id=p_tree and actor_id=v_actor
    and operation='export.create' and idempotency_key=p_key and expires_at>clock_timestamp() for update;
  if found then
    if v_existing.request_hash<>p_hash then raise exception using errcode='P0008',message='export request key changed'; end if;
    if not exists(select 1 from private.export_jobs j where j.id=(v_existing.response->>'id')::uuid
      and j.tree_id=p_tree and j.requested_by=v_actor and j.format=p_format and j.scope=p_scope and j.purpose=btrim(p_purpose)) then
      raise exception using errcode='P0008',message='export request payload changed'; end if;
    return private.export_job_state((v_existing.response->>'id')::uuid);
  end if;
  if (select count(*) from private.export_jobs where requested_by=v_actor and created_at>clock_timestamp()-interval '24 hours')>=3 then
    raise exception using errcode='P0010',message='export quota exceeded'; end if;
  select policy_version into v_policy from private.trees where id=p_tree for share;
  insert into private.export_jobs(tree_id,created_by,requested_by,purpose,format,scope,policy_version)
    values(p_tree,v_actor,v_actor,btrim(p_purpose),p_format,p_scope,v_policy) returning id into v_id;
  v_result:=private.export_job_state(v_id);
  insert into private.idempotency_records(tree_id,actor_id,operation,idempotency_key,request_hash,response,expires_at)
    values(p_tree,v_actor,'export.create',p_key,p_hash,v_result,clock_timestamp()+interval '24 hours');
  insert into private.audit_events(tree_id,actor_id,action,resource_kind,resource_id,request_id,redacted_summary)
    values(p_tree,v_actor,'export.requested','export_job',v_id,gen_random_uuid(),'Private export job queued; artifact not yet available');
  -- No complete status, output asset or download token is manufactured here.
  return v_result;
end $$;

create function api.export_job_create(p_tree uuid,p_format text,p_scope jsonb,p_purpose text,p_key uuid,p_hash text) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.export_job_create(p_tree,p_format,p_scope,p_purpose,p_key,p_hash); $$;
create function api.export_job_state(p_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.export_job_state(p_id); $$;
revoke all on function private.export_require_scope(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.export_job_state(uuid),private.export_job_create(uuid,text,jsonb,text,uuid,text),
  api.export_job_state(uuid),api.export_job_create(uuid,text,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function private.export_job_state(uuid),private.export_job_create(uuid,text,jsonb,text,uuid,text),
  api.export_job_state(uuid),api.export_job_create(uuid,text,jsonb,text,uuid,text) to authenticated;
commit;
