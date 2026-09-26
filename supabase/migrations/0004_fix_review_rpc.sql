-- Append-only fix for CORE-01 review RPC column ambiguity.

begin;

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

  if v_proposal.status not in ('submitted', 'needs_info') then
    raise exception using errcode = 'P0001', message = 'proposal is not reviewable';
  end if;

  if p_base_version is distinct from v_proposal.version then
    raise exception using errcode = '40001', message = 'proposal version is stale';
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
