-- M08-03: approve person additions atomically with proposal, audit and outbox.
begin;

create or replace function private.apply_proposal_person_create_items(
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
  v_person_id uuid;
  v_person_version bigint;
  v_request_id uuid := gen_random_uuid();
  v_count integer := 0;
begin
  for v_item in
    select pi.*
    from private.proposal_items as pi
    where pi.tree_id = p_tree_id
      and pi.proposal_id = p_proposal_id
      and pi.target_kind = 'person'
      and pi.operation = 'create'
    order by pi.id
  loop
    v_changes := v_item.field_changes;

    if nullif(btrim(v_changes ->> 'display_name'), '') is null then
      raise exception using errcode = '22023', message = 'person create display_name is required';
    end if;

    if v_changes = '{}'::jsonb then
      raise exception using errcode = '22023', message = 'person create must contain fields';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(v_changes) as key
      where key not in (
        'display_name', 'recorded_sex', 'life_status', 'visibility',
        'protected_minor', 'primary_branch_id', 'biography', 'confidence'
      )
    ) then
      raise exception using errcode = '22023', message = 'person create contains a forbidden field';
    end if;

    if nullif(v_changes ->> 'recorded_sex', '') is not null
      and (v_changes ->> 'recorded_sex') not in ('M', 'F', 'X', 'U')
    then
      raise exception using errcode = '22023', message = 'person create recorded sex is invalid';
    end if;

    if coalesce(v_changes ->> 'life_status', 'unknown') not in ('living', 'deceased', 'unknown') then
      raise exception using errcode = '22023', message = 'person create life status is invalid';
    end if;

    if coalesce(v_changes ->> 'visibility', 'restricted') not in ('public', 'members', 'restricted') then
      raise exception using errcode = '22023', message = 'person create visibility is invalid';
    end if;

    if coalesce(v_changes ->> 'confidence', 'unverified') not in ('unverified', 'supported', 'verified', 'disputed') then
      raise exception using errcode = '22023', message = 'person create confidence is invalid';
    end if;

    if coalesce(array_length(v_item.source_ids, 1), 0) = 0
      or exists (
        select 1
        from unnest(v_item.source_ids) as source_id
        where not exists (
          select 1
          from private.sources as s
          where s.tree_id = p_tree_id and s.id = source_id
        )
      )
    then
      raise exception using errcode = '23503', message = 'person create source is outside the tree';
    end if;

    if nullif(v_changes ->> 'primary_branch_id', '') is not null
      and not exists (
        select 1
        from private.branches as b
        where b.id = (v_changes ->> 'primary_branch_id')::uuid
          and b.tree_id = p_tree_id
      )
    then
      raise exception using errcode = '23503', message = 'person create branch is outside the tree';
    end if;

    insert into private.persons (
      tree_id, created_by, code, display_name, name_search, recorded_sex,
      life_status, visibility, protected_minor, primary_branch_id, biography, confidence
    ) values (
      p_tree_id,
      p_actor,
      'PROP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      btrim(v_changes ->> 'display_name'),
      private.normalize_name_search(v_changes ->> 'display_name'),
      nullif(v_changes ->> 'recorded_sex', ''),
      coalesce(v_changes ->> 'life_status', 'unknown'),
      coalesce(v_changes ->> 'visibility', 'restricted'),
      coalesce((v_changes ->> 'protected_minor')::boolean, false),
      nullif(v_changes ->> 'primary_branch_id', '')::uuid,
      nullif(v_changes ->> 'biography', ''),
      coalesce(v_changes ->> 'confidence', 'unverified')
    )
    returning id, version into v_person_id, v_person_version;

    update private.proposal_items
    set target_id = v_person_id
    where id = v_item.id
      and tree_id = p_tree_id;

    insert into private.audit_events (
      tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
    ) values (
      p_tree_id, p_actor, 'person.created', 'person', v_person_id, v_request_id,
      'Person projection created from approved proposal'
    );

    insert into private.outbox (
      tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
    ) values (
      p_tree_id, 'person.created', v_person_id, v_person_version,
      'person.created:' || v_person_id::text || ':' || v_person_version::text, p_actor
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function private.apply_proposal_person_items(
  p_tree_id uuid,
  p_proposal_id uuid,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_item record;
  v_changes jsonb;
  v_person private.persons%rowtype;
  v_link private.parent_links%rowtype;
  v_new_version bigint;
  v_request_id uuid := gen_random_uuid();
  v_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tree_id::text, 0));

  for v_item in
    select pi.*
    from private.proposal_items as pi
    where pi.tree_id = p_tree_id
      and pi.proposal_id = p_proposal_id
      and pi.target_kind = 'person'
      and pi.operation in ('update', 'delete')
    order by pi.id
  loop
    if v_item.target_id is null
      or v_item.operation not in ('update', 'delete')
    then
      raise exception using errcode = '22023', message = 'approved person proposal contains unsupported item';
    end if;

    select p.*
    into v_person
    from private.persons as p
    where p.id = v_item.target_id
      and p.tree_id = p_tree_id
    for update;

    if not found or v_person.deleted_at is not null then
      raise exception using errcode = 'P0002', message = 'person target not found';
    end if;

    if v_item.base_version is distinct from v_person.version then
      raise exception using errcode = 'P0009', message = 'person target version is stale';
    end if;

    v_changes := v_item.field_changes;
    if v_item.operation = 'delete' then
      if v_changes <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'soft-delete proposal cannot change fields';
      end if;

      update private.persons as p
      set deleted_at = clock_timestamp()
      where p.id = v_item.target_id
        and p.tree_id = p_tree_id
      returning p.version into v_new_version;

      insert into private.audit_events (
        tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
      ) values (
        p_tree_id, p_actor, 'person.soft_deleted', 'person', v_item.target_id, v_request_id,
        'Person soft-delete applied after approved impact preview'
      );

      insert into private.outbox (
        tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
      ) values (
        p_tree_id, 'person.soft_deleted', v_item.target_id, v_new_version,
        'person.soft_deleted:' || v_item.target_id::text || ':' || v_new_version::text, p_actor
      );

      for v_link in
        select pl.*
        from private.parent_links as pl
        where pl.tree_id = p_tree_id
          and pl.deleted_at is null
          and (pl.parent_id = v_item.target_id or pl.child_id = v_item.target_id)
        for update
      loop
        update private.parent_links as pl
        set deleted_at = clock_timestamp()
        where pl.tree_id = p_tree_id
          and pl.id = v_link.id
        returning pl.version into v_new_version;

        insert into private.audit_events (
          tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary
        ) values (
          p_tree_id, p_actor, 'parent_link.soft_deleted', 'parent_link', v_link.id, v_request_id,
          'Connected edge soft-deleted with person'
        );

        insert into private.outbox (
          tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
        ) values (
          p_tree_id, 'parent_link.soft_deleted', v_link.id, v_new_version,
          'parent_link.soft_deleted:' || v_link.id::text || ':' || v_new_version::text, p_actor
        );
      end loop;
    else
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
        (pi.target_kind = 'person' and pi.operation in ('create', 'update', 'delete'))
        or (pi.target_kind = 'parent_link' and pi.operation in ('create', 'delete'))
      );

    if v_item_count = 0 or v_supported_item_count <> v_item_count then
      raise exception using errcode = '22023', message = 'approved proposal contains unsupported items';
    end if;

    perform private.apply_proposal_person_create_items(v_proposal.tree_id, p_proposal_id, v_actor);
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

revoke all on function private.apply_proposal_person_create_items(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.apply_proposal_person_create_items(uuid, uuid, uuid) to authenticated;

commit;