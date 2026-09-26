-- CORE-02 idempotency wrappers.
-- Existing atomic mutation RPCs remain the domain implementation; these
-- wrappers reserve and replay actor/tree-scoped mutation results.

begin;

create or replace function private.proposal_submit_idempotent(
  p_tree_id uuid,
  p_kind text,
  p_reason text,
  p_branch_id uuid,
  p_base_snapshot jsonb,
  p_items jsonb,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  tree_id uuid,
  status text,
  version bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_existing private.idempotency_records%rowtype;
  v_result record;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;

  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;

  if not private.has_capability(p_tree_id, 'proposal.submit', p_branch_id) then
    raise exception using errcode = '42501', message = 'proposal submit capability required';
  end if;

  select *
  into v_existing
  from private.idempotency_records as r
  where r.tree_id = p_tree_id
    and r.actor_id = v_actor
    and r.operation = 'proposal.submit'
    and r.idempotency_key = p_idempotency_key
    and r.expires_at > clock_timestamp()
  for update;

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode = 'P0008', message = 'idempotent request is still in progress';
    end if;
    return query
      select
        (v_existing.response ->> 'id')::uuid,
        (v_existing.response ->> 'treeId')::uuid,
        v_existing.response ->> 'status',
        (v_existing.response ->> 'version')::bigint;
    return;
  end if;

  delete from private.idempotency_records as r
  where r.tree_id = p_tree_id
    and r.actor_id = v_actor
    and r.operation = 'proposal.submit'
    and r.idempotency_key = p_idempotency_key;

  begin
    insert into private.idempotency_records (
      tree_id, actor_id, operation, idempotency_key, request_hash, expires_at
    ) values (
      p_tree_id, v_actor, 'proposal.submit', p_idempotency_key, p_request_hash,
      clock_timestamp() + interval '24 hours'
    );
  exception when unique_violation then
    select *
    into v_existing
    from private.idempotency_records as r
    where r.tree_id = p_tree_id
      and r.actor_id = v_actor
      and r.operation = 'proposal.submit'
      and r.idempotency_key = p_idempotency_key
    for update;
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode = 'P0008', message = 'idempotent request is still in progress';
    end if;
    return query
      select
        (v_existing.response ->> 'id')::uuid,
        (v_existing.response ->> 'treeId')::uuid,
        v_existing.response ->> 'status',
        (v_existing.response ->> 'version')::bigint;
    return;
  end;

  select *
  into v_result
  from private.proposal_submit_authorized(
    p_tree_id, p_kind, p_reason, p_branch_id, p_base_snapshot, p_items
  );

  update private.idempotency_records as r
  set response = jsonb_build_object(
    'id', v_result.id,
    'treeId', v_result.tree_id,
    'status', v_result.status,
    'version', v_result.version
  )
  where r.tree_id = p_tree_id
    and r.actor_id = v_actor
    and r.operation = 'proposal.submit'
    and r.idempotency_key = p_idempotency_key;

  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;

create or replace function private.proposal_review_idempotent(
  p_proposal_id uuid,
  p_decision text,
  p_reason text,
  p_base_version bigint,
  p_reviewed_snapshot_hash text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  tree_id uuid,
  status text,
  version bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_tree_id uuid;
  v_branch_id uuid;
  v_existing private.idempotency_records%rowtype;
  v_result record;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;

  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;

  select p.tree_id, p.branch_id
  into v_tree_id, v_branch_id
  from private.proposals as p
  where p.id = p_proposal_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'proposal not found';
  end if;

  if not private.has_capability(v_tree_id, 'proposal.review', v_branch_id) then
    raise exception using errcode = '42501', message = 'proposal review capability required';
  end if;

  select *
  into v_existing
  from private.idempotency_records as r
  where r.tree_id = v_tree_id
    and r.actor_id = v_actor
    and r.operation = 'proposal.review'
    and r.idempotency_key = p_idempotency_key
    and r.expires_at > clock_timestamp()
  for update;

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode = 'P0008', message = 'idempotent request is still in progress';
    end if;
    return query
      select
        (v_existing.response ->> 'id')::uuid,
        (v_existing.response ->> 'treeId')::uuid,
        v_existing.response ->> 'status',
        (v_existing.response ->> 'version')::bigint;
    return;
  end if;

  delete from private.idempotency_records as r
  where r.tree_id = v_tree_id
    and r.actor_id = v_actor
    and r.operation = 'proposal.review'
    and r.idempotency_key = p_idempotency_key;

  begin
    insert into private.idempotency_records (
      tree_id, actor_id, operation, idempotency_key, request_hash, expires_at
    ) values (
      v_tree_id, v_actor, 'proposal.review', p_idempotency_key, p_request_hash,
      clock_timestamp() + interval '24 hours'
    );
  exception when unique_violation then
    select *
    into v_existing
    from private.idempotency_records as r
    where r.tree_id = v_tree_id
      and r.actor_id = v_actor
      and r.operation = 'proposal.review'
      and r.idempotency_key = p_idempotency_key
    for update;
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode = 'P0008', message = 'idempotent request is still in progress';
    end if;
    return query
      select
        (v_existing.response ->> 'id')::uuid,
        (v_existing.response ->> 'treeId')::uuid,
        v_existing.response ->> 'status',
        (v_existing.response ->> 'version')::bigint;
    return;
  end;

  select *
  into v_result
  from private.proposal_review_authorized(
    p_proposal_id, p_decision, p_reason, p_base_version, p_reviewed_snapshot_hash
  );

  update private.idempotency_records as r
  set response = jsonb_build_object(
    'id', v_result.id,
    'treeId', v_result.tree_id,
    'status', v_result.status,
    'version', v_result.version
  )
  where r.tree_id = v_tree_id
    and r.actor_id = v_actor
    and r.operation = 'proposal.review'
    and r.idempotency_key = p_idempotency_key;

  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;

create or replace function api.proposal_submit_idempotent(
  p_tree_id uuid,
  p_kind text,
  p_reason text,
  p_branch_id uuid,
  p_base_snapshot jsonb,
  p_items jsonb,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  tree_id uuid,
  status text,
  version bigint
)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.proposal_submit_idempotent(
    p_tree_id, p_kind, p_reason, p_branch_id, p_base_snapshot, p_items,
    p_idempotency_key, p_request_hash
  );
$$;

create or replace function api.proposal_review_idempotent(
  p_proposal_id uuid,
  p_decision text,
  p_reason text,
  p_base_version bigint,
  p_reviewed_snapshot_hash text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  tree_id uuid,
  status text,
  version bigint
)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.proposal_review_idempotent(
    p_proposal_id, p_decision, p_reason, p_base_version, p_reviewed_snapshot_hash,
    p_idempotency_key, p_request_hash
  );
$$;

revoke all on function private.proposal_submit_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function private.proposal_review_idempotent(uuid, text, text, bigint, text, uuid, text) from public, anon, authenticated;
revoke all on function api.proposal_submit_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function api.proposal_review_idempotent(uuid, text, text, bigint, text, uuid, text) from public, anon, authenticated;
grant execute on function api.proposal_submit_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) to authenticated;
grant execute on function api.proposal_review_idempotent(uuid, text, text, bigint, text, uuid, text) to authenticated;
grant execute on function private.proposal_submit_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) to authenticated;
grant execute on function private.proposal_review_idempotent(uuid, text, text, bigint, text, uuid, text) to authenticated;

commit;
