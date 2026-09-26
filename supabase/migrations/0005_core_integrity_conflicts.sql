-- Append-only CORE-01 integrity/conflict fixes.
-- Proposal targets stay inside the requested tree and stale review attempts
-- return a serialization failure before a terminal-status error.

begin;

create or replace function private.proposal_submit_authorized(
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
    p_tree_id, v_actor, v_actor, 'submitted', p_kind, btrim(p_reason), p_branch_id, p_base_snapshot
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
    p_tree_id, v_actor, 'proposal.submitted', 'proposal', v_proposal_id, v_request_id,
    'Synthetic proposal submitted through authorized RPC'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    p_tree_id, 'proposal.submitted', v_proposal_id, 1,
    'proposal.submitted:' || v_proposal_id::text || ':1', v_actor
  );

  return query
    select p.id, p.tree_id, p.status, p.version
    from private.proposals as p
    where p.id = v_proposal_id;
end;
$$;

create or replace function private.proposal_review_authorized(
  p_proposal_id uuid,
  p_decision text,
  p_reason text,
  p_base_version bigint,
  p_reviewed_snapshot_hash text
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

  if p_decision not in ('approve', 'reject', 'needs_info') then
    raise exception using errcode = '22023', message = 'unsupported review decision';
  end if;

  if nullif(btrim(p_reason), '') is null or length(p_reason) > 4000 then
    raise exception using errcode = '22023', message = 'review reason is required and must be <= 4000 characters';
  end if;

  if nullif(btrim(p_reviewed_snapshot_hash), '') is null or length(p_reviewed_snapshot_hash) > 256 then
    raise exception using errcode = '22023', message = 'reviewed snapshot hash is required';
  end if;

  select p.* into v_proposal
  from private.proposals as p
  where p.id = p_proposal_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'proposal not found';
  end if;

  if not private.has_capability(v_proposal.tree_id, 'proposal.review', v_proposal.branch_id) then
    raise exception using errcode = '42501', message = 'proposal review capability required';
  end if;

  if v_proposal.submitted_by = v_actor then
    raise exception using errcode = '42501', message = 'author cannot review own proposal';
  end if;

  if p_base_version is distinct from v_proposal.version then
    raise exception using errcode = '40001', message = 'proposal version is stale';
  end if;

  if v_proposal.status not in ('submitted', 'needs_info') then
    raise exception using errcode = 'P0001', message = 'proposal is not reviewable';
  end if;

  v_status := case p_decision
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    else 'needs_info'
  end;

  update private.proposals as p
  set status = v_status
  where p.id = p_proposal_id;

  insert into private.review_decisions (
    tree_id, created_by, proposal_id, reviewer_id, decision, reason,
    base_version, reviewed_snapshot_hash
  ) values (
    v_proposal.tree_id, v_actor, p_proposal_id, v_actor, p_decision, btrim(p_reason),
    p_base_version, p_reviewed_snapshot_hash
  );

  insert into private.audit_events (
    tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
  ) values (
    v_proposal.tree_id, v_actor, 'proposal.' || p_decision, 'proposal', p_proposal_id,
    v_request_id, 'Synthetic proposal review recorded through authorized RPC'
  );

  insert into private.outbox (
    tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
  ) values (
    v_proposal.tree_id, 'proposal.' || p_decision, p_proposal_id, v_proposal.version + 1,
    'proposal.' || p_decision || ':' || p_proposal_id::text || ':' || (v_proposal.version + 1)::text,
    v_actor
  );

  return query
    select p.id, p.tree_id, p.status, p.version
    from private.proposals as p
    where p.id = p_proposal_id;
end;
$$;

commit;
