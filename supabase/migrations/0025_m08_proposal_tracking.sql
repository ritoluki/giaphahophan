-- M08-01: source-backed proposal tracking and authorized read projections.
begin;

alter table private.proposals add column if not exists tracking_code text;
update private.proposals
set tracking_code = 'PGP-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where tracking_code is null;
alter table private.proposals alter column tracking_code set default ('PGP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
alter table private.proposals alter column tracking_code set not null;
create unique index if not exists proposals_tracking_code_key on private.proposals (tracking_code);

create or replace function private.proposal_get_authorized(p_proposal_id uuid)
returns table (
  id uuid,
  tracking_code text,
  tree_id uuid,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  kind text,
  reason text,
  branch_id uuid,
  submitted_by uuid,
  items jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    p.id,
    p.tracking_code,
    p.tree_id,
    p.version,
    p.created_at,
    p.updated_at,
    p.status,
    p.kind,
    p.reason,
    p.branch_id,
    p.submitted_by,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pi.id,
          'targetKind', pi.target_kind,
          'targetId', pi.target_id,
          'baseVersion', pi.base_version,
          'operation', pi.operation,
          'fieldChanges', pi.field_changes,
          'sourceIds', to_jsonb(pi.source_ids)
        ) order by pi.created_at, pi.id
      )
      from private.proposal_items as pi
      where pi.tree_id = p.tree_id and pi.proposal_id = p.id
    ), '[]'::jsonb) as items
  from private.proposals as p
  where p.id = p_proposal_id
    and (
      (p.submitted_by = auth.uid() and private.is_active_member(p.tree_id))
      or private.has_capability(p.tree_id, 'proposal.review', p.branch_id)
    );
$$;

create or replace function api.proposal_get(p_proposal_id uuid)
returns table (
  id uuid,
  tracking_code text,
  tree_id uuid,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  kind text,
  reason text,
  branch_id uuid,
  submitted_by uuid,
  items jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from private.proposal_get_authorized(p_proposal_id);
$$;

create or replace function private.proposal_submit_context_authorized()
returns table (
  tree_id uuid,
  tree_name text,
  branch_id uuid,
  branch_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_tree record;
  v_branch record;
  v_returned_tree boolean;
begin
  for v_tree in
    select t.id, t.name
    from private.trees as t
    where private.is_active_member(t.id)
    order by t.name, t.id
  loop
    v_returned_tree := false;
    if private.has_capability(v_tree.id, 'proposal.submit', null) then
      tree_id := v_tree.id;
      tree_name := v_tree.name;
      branch_id := null;
      branch_name := null;
      return next;
      v_returned_tree := true;
    end if;

    if not v_returned_tree then
      for v_branch in
        select b.id, b.name
        from private.branches as b
        where b.tree_id = v_tree.id
          and private.has_capability(v_tree.id, 'proposal.submit', b.id)
        order by b.name, b.id
      loop
        tree_id := v_tree.id;
        tree_name := v_tree.name;
        branch_id := v_branch.id;
        branch_name := v_branch.name;
        return next;
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function api.proposal_submit_context()
returns table (
  tree_id uuid,
  tree_name text,
  branch_id uuid,
  branch_name text
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from private.proposal_submit_context_authorized();
$$;

revoke all on function private.proposal_get_authorized(uuid) from public, anon, authenticated;
revoke all on function api.proposal_get(uuid) from public, anon, authenticated;
revoke all on function private.proposal_submit_context_authorized() from public, anon, authenticated;
revoke all on function api.proposal_submit_context() from public, anon, authenticated;
grant execute on function private.proposal_get_authorized(uuid) to authenticated;
grant execute on function private.proposal_submit_context_authorized() to authenticated;
grant execute on function api.proposal_get(uuid) to authenticated;
grant execute on function api.proposal_submit_context() to authenticated;

commit;