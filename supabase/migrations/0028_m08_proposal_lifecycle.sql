begin;
create or replace function private.proposal_draft_authorized(
  p_tree_id uuid,
  p_kind text,
  p_reason text,
  p_branch_id uuid,
  p_base_snapshot jsonb,
  p_items jsonb
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
  v_proposal_id uuid;
  v_item jsonb;
  v_target_id uuid;
  v_target_kind text;
  v_request_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;

  if not private.has_capability(p_tree_id, 'proposal.submit', p_branch_id) then
    raise exception using errcode = '42501', message = 'proposal submit capability required';
  end if;

  if p_kind not in ('correction', 'addition', 'relationship', 'merge', 'publication') then
    raise exception using errcode = '22023', message = 'unsupported proposal kind';
  end if;

  if nullif(btrim(p_reason), '') is null or length(p_reason) > 4000 then
    raise exception using errcode = '22023', message = 'proposal reason is required and must be <= 4000 characters';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from private.branches as b where b.id = p_branch_id and b.tree_id = p_tree_id
  ) then
    raise exception using errcode = '23503', message = 'proposal branch is outside the tree';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'proposal must contain at least one item';
  end if;

  insert into private.proposals (
    tree_id, created_by, submitted_by, status, kind, reason, branch_id, base_snapshot
  ) values (
    p_tree_id, v_actor, v_actor, 'draft', p_kind, btrim(p_reason), p_branch_id, p_base_snapshot
  )
  returning private.proposals.id into v_proposal_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_target_kind := v_item ->> 'target_kind';
    v_target_id := nullif(v_item ->> 'target_id', '')::uuid;

    if jsonb_typeof(v_item -> 'field_changes') <> 'object' then
      raise exception using errcode = '22023', message = 'proposal item field_changes must be an object';
    end if;

    if v_target_kind = 'person' and v_target_id is not null and not exists (
      select 1 from private.persons as p where p.id = v_target_id and p.tree_id = p_tree_id
    ) then
      raise exception using errcode = '23503', message = 'proposal person target is outside the tree';
    end if;

    if v_target_kind = 'branch' and v_target_id is not null and not exists (
      select 1 from private.branches as b where b.id = v_target_id and b.tree_id = p_tree_id
    ) then
      raise exception using errcode = '23503', message = 'proposal branch target is outside the tree';
    end if;

    insert into private.proposal_items (
      tree_id, created_by, proposal_id, target_kind, target_id, base_version,
      operation, field_changes, source_ids
    ) values (
      p_tree_id,
      v_actor,
      v_proposal_id,
      v_target_kind,
      v_target_id,
      nullif(v_item ->> 'base_version', '')::bigint,
      v_item ->> 'operation',
      v_item -> 'field_changes',
      case
        when jsonb_typeof(v_item -> 'source_ids') = 'array'
          then array(select jsonb_array_elements_text(v_item -> 'source_ids'))::uuid[]
        else '{}'::uuid[]
      end
    );
  end loop;

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    p_tree_id, v_actor, 'proposal.drafted', 'proposal', v_proposal_id, v_request_id,
    'Synthetic proposal submitted through authorized RPC'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    p_tree_id, 'proposal.drafted', v_proposal_id, 1,
    'proposal.drafted:' || v_proposal_id::text || ':1', v_actor
  );

  return query
    select p.id, p.tree_id, p.status, p.version
    from private.proposals as p
    where p.id = v_proposal_id;
end;
$$;
create or replace function private.proposal_draft_idempotent(
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
    and r.operation = 'proposal.draft'
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
    and r.operation = 'proposal.draft'
    and r.idempotency_key = p_idempotency_key;

  begin
    insert into private.idempotency_records (
      tree_id, actor_id, operation, idempotency_key, request_hash, expires_at
    ) values (
      p_tree_id, v_actor, 'proposal.draft', p_idempotency_key, p_request_hash,
      clock_timestamp() + interval '24 hours'
    );
  exception when unique_violation then
    select *
    into v_existing
    from private.idempotency_records as r
    where r.tree_id = p_tree_id
      and r.actor_id = v_actor
      and r.operation = 'proposal.draft'
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
  from private.proposal_draft_authorized(
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
    and r.operation = 'proposal.draft'
    and r.idempotency_key = p_idempotency_key;

  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;
create or replace function api.proposal_draft_idempotent(
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
  select * from private.proposal_draft_idempotent(
    p_tree_id, p_kind, p_reason, p_branch_id, p_base_snapshot, p_items,
    p_idempotency_key, p_request_hash
  );
$$;
create or replace function private.proposal_transition_authorized(
  p_proposal_id uuid,
  p_action text,
  p_reason text
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
  v_proposal private.proposals%rowtype;
  v_status text;
  v_request_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_action not in ('submit', 'withdraw') then
    raise exception using errcode = '22023', message = 'unsupported proposal lifecycle action';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 4000 then
    raise exception using errcode = '22023', message = 'lifecycle reason is required and must be <= 4000 characters';
  end if;

  select p.*
  into v_proposal
  from private.proposals as p
  where p.id = p_proposal_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'proposal not found';
  end if;
  if v_proposal.submitted_by <> v_actor then
    raise exception using errcode = '42501', message = 'only the proposal author may change lifecycle';
  end if;
  if not private.has_capability(v_proposal.tree_id, 'proposal.submit', v_proposal.branch_id) then
    raise exception using errcode = '42501', message = 'proposal submit capability required';
  end if;

  if p_action = 'submit' and v_proposal.status in ('draft', 'needs_info') then
    v_status := 'submitted';
  elsif p_action = 'withdraw' and v_proposal.status in ('draft', 'submitted', 'needs_info') then
    v_status := 'withdrawn';
  else
    raise exception using errcode = 'P0001', message = 'proposal lifecycle transition is not allowed';
  end if;

  update private.proposals as p
  set status = v_status
  where p.id = p_proposal_id;

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    v_proposal.tree_id, v_actor, 'proposal.' || v_status, 'proposal', p_proposal_id,
    v_request_id, 'Proposal lifecycle transition recorded through authorized RPC'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    v_proposal.tree_id, 'proposal.' || v_status, p_proposal_id, v_proposal.version + 1,
    'proposal.' || v_status || ':' || p_proposal_id::text || ':' || (v_proposal.version + 1)::text,
    v_actor
  );

  return query
    select p.id, p.tree_id, p.status, p.version
    from private.proposals as p
    where p.id = p_proposal_id;
end;
$$;

create or replace function private.proposal_transition_idempotent(
  p_proposal_id uuid,
  p_action text,
  p_reason text,
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
  v_operation text := 'proposal.lifecycle.' || p_action;
  v_existing private.idempotency_records%rowtype;
  v_result record;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'authenticated actor required';
  end if;
  if p_idempotency_key is null or nullif(btrim(p_request_hash), '') is null then
    raise exception using errcode = '22023', message = 'idempotency key and request hash are required';
  end if;

  select p.tree_id into v_tree_id
  from private.proposals as p
  where p.id = p_proposal_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'proposal not found';
  end if;

  select * into v_existing
  from private.idempotency_records as r
  where r.tree_id = v_tree_id and r.actor_id = v_actor
    and r.operation = v_operation and r.idempotency_key = p_idempotency_key
    and r.expires_at > clock_timestamp()
  for update;

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0008', message = 'idempotency key was reused with a different request';
    end if;
    if v_existing.response is null then
      raise exception using errcode = 'P0008', message = 'idempotent request is still in progress';
    end if;
    return query select
      (v_existing.response ->> 'id')::uuid,
      (v_existing.response ->> 'treeId')::uuid,
      v_existing.response ->> 'status',
      (v_existing.response ->> 'version')::bigint;
    return;
  end if;

  insert into private.idempotency_records (
    tree_id, actor_id, operation, idempotency_key, request_hash, expires_at
  ) values (
    v_tree_id, v_actor, v_operation, p_idempotency_key, p_request_hash,
    clock_timestamp() + interval '24 hours'
  );

  select * into v_result
  from private.proposal_transition_authorized(p_proposal_id, p_action, p_reason);

  update private.idempotency_records as r
  set response = jsonb_build_object(
    'id', v_result.id, 'treeId', v_result.tree_id,
    'status', v_result.status, 'version', v_result.version
  )
  where r.tree_id = v_tree_id and r.actor_id = v_actor
    and r.operation = v_operation and r.idempotency_key = p_idempotency_key;

  return query select v_result.id, v_result.tree_id, v_result.status, v_result.version;
end;
$$;

create or replace function api.proposal_transition_idempotent(
  p_proposal_id uuid,
  p_action text,
  p_reason text,
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
  select * from private.proposal_transition_idempotent(
    p_proposal_id, p_action, p_reason, p_idempotency_key, p_request_hash
  );
$$;
create or replace function private.proposal_history_authorized(p_proposal_id uuid)
returns table (
  proposal_id uuid,
  entries jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    p.id,
    coalesce((
      select jsonb_agg(entry order by entry.created_at, entry.entry_id)
      from (
        select
          rd.id as entry_id,
          rd.created_at,
          jsonb_build_object(
            'id', rd.id,
            'kind', 'review',
            'status', case rd.decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'needs_info' end,
            'decision', rd.decision,
            'reason', rd.reason,
            'createdAt', rd.created_at
          ) as entry
        from private.review_decisions as rd
        where rd.tree_id = p.tree_id and rd.proposal_id = p.id
        union all
        select
          ae.id as entry_id,
          ae.created_at,
          jsonb_build_object(
            'id', ae.id,
            'kind', 'event',
            'status', case ae.action
              when 'proposal.drafted' then 'drafted'
              when 'proposal.submitted' then 'submitted'
              when 'proposal.needs_info' then 'needs_info'
              when 'proposal.approved' then 'approved'
              when 'proposal.reject' then 'rejected'
              when 'proposal.withdrawn' then 'withdrawn'
              else replace(ae.action, 'proposal.', '')
            end,
            'decision', null,
            'reason', ae.redacted_summary,
            'createdAt', ae.created_at
          ) as entry
        from private.audit_events as ae
        where ae.tree_id = p.tree_id
          and ae.resource_kind = 'proposal'
          and ae.resource_id = p.id
      ) as entry
    ), '[]'::jsonb)
  from private.proposals as p
  where p.id = p_proposal_id
    and (
      (p.submitted_by = auth.uid() and private.is_active_member(p.tree_id))
      or private.has_capability(p.tree_id, 'proposal.review', p.branch_id)
    );
$$;

create or replace function api.proposal_history(p_proposal_id uuid)
returns table (
  proposal_id uuid,
  entries jsonb
)
language sql
security invoker
set search_path = pg_catalog
as $$
  select * from private.proposal_history_authorized(p_proposal_id);
$$;

revoke all on function private.proposal_draft_authorized(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.proposal_draft_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function api.proposal_draft_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function private.proposal_transition_authorized(uuid, text, text) from public, anon, authenticated;
revoke all on function private.proposal_transition_idempotent(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function api.proposal_transition_idempotent(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.proposal_history_authorized(uuid) from public, anon, authenticated;
revoke all on function api.proposal_history(uuid) from public, anon, authenticated;
grant execute on function private.proposal_draft_authorized(uuid, text, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function private.proposal_draft_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) to authenticated;
grant execute on function api.proposal_draft_idempotent(uuid, text, text, uuid, jsonb, jsonb, uuid, text) to authenticated;
grant execute on function private.proposal_transition_authorized(uuid, text, text) to authenticated;
grant execute on function private.proposal_transition_idempotent(uuid, text, text, uuid, text) to authenticated;
grant execute on function api.proposal_transition_idempotent(uuid, text, text, uuid, text) to authenticated;
grant execute on function private.proposal_history_authorized(uuid) to authenticated;
grant execute on function api.proposal_history(uuid) to authenticated;

commit;