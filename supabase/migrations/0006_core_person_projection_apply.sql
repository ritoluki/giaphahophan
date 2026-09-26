-- CORE-02: approved person corrections update the canonical row atomically.
-- Unsupported proposal item kinds are rejected instead of being marked approved.

begin;

create or replace function private.apply_proposal_person_items(
  p_tree_id uuid,
  p_proposal_id uuid,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item record;
  v_changes jsonb;
  v_person_version bigint;
  v_new_version bigint;
  v_request_id uuid := gen_random_uuid();
  v_count integer := 0;
begin
  for v_item in
    select pi.*
    from private.proposal_items as pi
    where pi.tree_id = p_tree_id
      and pi.proposal_id = p_proposal_id
    order by pi.id
  loop
    if v_item.target_kind <> 'person'
      or v_item.operation <> 'update'
      or v_item.target_id is null
    then
      raise exception using errcode = '22023', message = 'approved person correction contains unsupported item';
    end if;

    v_changes := v_item.field_changes;
    if v_changes = '{}'::jsonb then
      raise exception using errcode = '22023', message = 'approved person correction must change a field';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(v_changes) as key
      where key not in (
        'display_name', 'recorded_sex', 'life_status', 'visibility',
        'protected_minor', 'primary_branch_id', 'biography', 'confidence'
      )
    ) then
      raise exception using errcode = '22023', message = 'approved person correction contains a forbidden field';
    end if;

    if v_changes ? 'primary_branch_id'
      and nullif(v_changes ->> 'primary_branch_id', '') is not null
      and not exists (
        select 1
        from private.branches as b
        where b.id = (v_changes ->> 'primary_branch_id')::uuid
          and b.tree_id = p_tree_id
      )
    then
      raise exception using errcode = '23503', message = 'person branch target is outside the tree';
    end if;

    select p.version
    into v_person_version
    from private.persons as p
    where p.id = v_item.target_id
      and p.tree_id = p_tree_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'person target not found';
    end if;

    if v_item.base_version is distinct from v_person_version then
      raise exception using errcode = '40001', message = 'person target version is stale';
    end if;

    update private.persons as p
    set
      display_name = case
        when v_changes ? 'display_name' then coalesce(nullif(v_changes ->> 'display_name', ''), p.display_name)
        else p.display_name
      end,
      recorded_sex = case
        when v_changes ? 'recorded_sex' then nullif(v_changes ->> 'recorded_sex', '')
        else p.recorded_sex
      end,
      life_status = case
        when v_changes ? 'life_status' then v_changes ->> 'life_status'
        else p.life_status
      end,
      visibility = case
        when v_changes ? 'visibility' then v_changes ->> 'visibility'
        else p.visibility
      end,
      protected_minor = case
        when v_changes ? 'protected_minor' then (v_changes ->> 'protected_minor')::boolean
        else p.protected_minor
      end,
      primary_branch_id = case
        when v_changes ? 'primary_branch_id' then nullif(v_changes ->> 'primary_branch_id', '')::uuid
        else p.primary_branch_id
      end,
      biography = case
        when v_changes ? 'biography' then v_changes ->> 'biography'
        else p.biography
      end,
      confidence = case
        when v_changes ? 'confidence' then v_changes ->> 'confidence'
        else p.confidence
      end
    where p.id = v_item.target_id
      and p.tree_id = p_tree_id
    returning p.version into v_new_version;

    insert into private.audit_events (
      tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
    ) values (
      p_tree_id, p_actor, 'person.updated', 'person', v_item.target_id, v_request_id,
      'Person projection applied from approved proposal'
    );

    insert into private.outbox (
      tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
    ) values (
      p_tree_id, 'person.updated', v_item.target_id, v_new_version,
      'person.updated:' || v_item.target_id::text || ':' || v_new_version::text, p_actor
    );

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception using errcode = '22023', message = 'approved proposal has no items';
  end if;

  return v_count;
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

  if p_decision = 'approve' then
    perform private.apply_proposal_person_items(v_proposal.tree_id, p_proposal_id, v_actor);
  end if;

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

revoke all on function private.apply_proposal_person_items(uuid, uuid, uuid) from public, anon, authenticated;

commit;
