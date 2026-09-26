-- CORE-02 relationship proposals.
-- Parent-link changes are applied atomically with tree-scoped locking and
-- ancestry cycle checks. Unsupported proposal items cannot be approved.

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
      and pi.target_kind = 'person'
      and pi.operation = 'update'
    order by pi.id
  loop
    if v_item.target_id is null then
      raise exception using errcode = '22023', message = 'person correction target is required';
    end if;

    v_changes := v_item.field_changes;
    if v_changes = '{}'::jsonb then
      raise exception using errcode = '22023', message = 'person correction must change a field';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(v_changes) as key
      where key not in (
        'display_name', 'recorded_sex', 'life_status', 'visibility',
        'protected_minor', 'primary_branch_id', 'biography', 'confidence'
      )
    ) then
      raise exception using errcode = '22023', message = 'person correction contains a forbidden field';
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
      raise exception using errcode = 'P0009', message = 'person target version is stale';
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

  return v_count;
end;
$$;

create or replace function private.apply_proposal_parent_link_items(
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
  v_link private.parent_links%rowtype;
  v_link_id uuid;
  v_new_version bigint;
  v_request_id uuid := gen_random_uuid();
  v_count integer := 0;
begin
  for v_item in
    select pi.*
    from private.proposal_items as pi
    where pi.tree_id = p_tree_id
      and pi.proposal_id = p_proposal_id
      and pi.target_kind = 'parent_link'
    order by pi.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_tree_id::text, 0));
    v_changes := v_item.field_changes;

    if v_item.operation = 'create' then
      if not (
        v_changes ? 'parent_id'
        and v_changes ? 'child_id'
        and v_changes ? 'kind'
        and v_changes ? 'status'
        and v_changes ? 'source_id'
      ) then
        raise exception using errcode = '22023', message = 'parent link create command is incomplete';
      end if;

      if (v_changes ->> 'parent_id')::uuid = (v_changes ->> 'child_id')::uuid then
        raise exception using errcode = '23514', message = 'parent link cannot point to itself';
      end if;

      if not exists (
        select 1
        from private.persons as parent
        join private.persons as child on child.tree_id = parent.tree_id
        where parent.tree_id = p_tree_id
          and parent.id = (v_changes ->> 'parent_id')::uuid
          and child.id = (v_changes ->> 'child_id')::uuid
      ) then
        raise exception using errcode = '23503', message = 'parent link person is outside the tree';
      end if;

      if not exists (
        select 1
        from private.sources as s
        where s.tree_id = p_tree_id
          and s.id = (v_changes ->> 'source_id')::uuid
      ) then
        raise exception using errcode = '23503', message = 'parent link source is outside the tree';
      end if;

      if (v_changes ->> 'status') = 'confirmed'
        and (v_changes ->> 'kind') in ('biological', 'adoptive')
        and exists (
          with recursive descendants(id) as (
            select (v_changes ->> 'child_id')::uuid
            union
            select pl.child_id
            from private.parent_links as pl
            join descendants as d on d.id = pl.parent_id
            where pl.tree_id = p_tree_id
              and pl.deleted_at is null
              and pl.status = 'confirmed'
              and pl.kind in ('biological', 'adoptive')
          )
          select 1
          from descendants
          where id = (v_changes ->> 'parent_id')::uuid
        )
      then
        raise exception using errcode = '23514', message = 'parent link would create an ancestry cycle';
      end if;

      insert into private.parent_links (
        tree_id, created_by, parent_id, child_id, kind, status, ordinal, source_id
      ) values (
        p_tree_id,
        p_actor,
        (v_changes ->> 'parent_id')::uuid,
        (v_changes ->> 'child_id')::uuid,
        v_changes ->> 'kind',
        v_changes ->> 'status',
        nullif(v_changes ->> 'ordinal', '')::integer,
        (v_changes ->> 'source_id')::uuid
      )
      returning id, version into v_link_id, v_new_version;

      insert into private.audit_events (
        tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
      ) values (
        p_tree_id, p_actor, 'parent_link.created', 'parent_link', v_link_id, v_request_id,
        'Parent link applied from approved relationship proposal'
      );

      insert into private.outbox (
        tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
      ) values (
        p_tree_id, 'parent_link.created', v_link_id, v_new_version,
        'parent_link.created:' || v_link_id::text || ':' || v_new_version::text, p_actor
      );
    elsif v_item.operation = 'delete' then
      if v_item.target_id is null then
        raise exception using errcode = '22023', message = 'parent link delete target is required';
      end if;

      select pl.*
      into v_link
      from private.parent_links as pl
      where pl.tree_id = p_tree_id
        and pl.id = v_item.target_id
        and pl.deleted_at is null
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'parent link target not found';
      end if;

      if v_item.base_version is distinct from v_link.version then
        raise exception using errcode = 'P0009', message = 'parent link target version is stale';
      end if;

      update private.parent_links as pl
      set deleted_at = clock_timestamp()
      where pl.tree_id = p_tree_id
        and pl.id = v_item.target_id
      returning pl.version into v_new_version;

      insert into private.audit_events (
        tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
      ) values (
        p_tree_id, p_actor, 'parent_link.deleted', 'parent_link', v_item.target_id, v_request_id,
        'Parent link soft-deleted from approved relationship proposal'
      );

      insert into private.outbox (
        tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
      ) values (
        p_tree_id, 'parent_link.deleted', v_item.target_id, v_new_version,
        'parent_link.deleted:' || v_item.target_id::text || ':' || v_new_version::text, p_actor
      );
    else
      raise exception using errcode = '22023', message = 'unsupported parent link proposal operation';
    end if;

    v_count := v_count + 1;
  end loop;

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
  v_item_count integer;
  v_supported_item_count integer;
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

  select p.*
  into v_proposal
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
    raise exception using errcode = 'P0009', message = 'proposal version is stale';
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
    select count(*) into v_item_count
    from private.proposal_items as pi
    where pi.tree_id = v_proposal.tree_id
      and pi.proposal_id = p_proposal_id;

    select count(*) into v_supported_item_count
    from private.proposal_items as pi
    where pi.tree_id = v_proposal.tree_id
      and pi.proposal_id = p_proposal_id
      and (
        (pi.target_kind = 'person' and pi.operation = 'update')
        or (pi.target_kind = 'parent_link' and pi.operation in ('create', 'delete'))
      );

    if v_item_count = 0 or v_supported_item_count <> v_item_count then
      raise exception using errcode = '22023', message = 'approved proposal contains unsupported items';
    end if;

    perform private.apply_proposal_person_items(v_proposal.tree_id, p_proposal_id, v_actor);
    perform private.apply_proposal_parent_link_items(v_proposal.tree_id, p_proposal_id, v_actor);
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

revoke all on function private.apply_proposal_parent_link_items(uuid, uuid, uuid) from public, anon, authenticated;

commit;
