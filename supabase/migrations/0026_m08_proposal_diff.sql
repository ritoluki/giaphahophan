-- M08-02: authorized base/current/proposed diff projection.
begin;

create or replace function private.proposal_diff_authorized(p_proposal_id uuid)
returns table (
  proposal_id uuid,
  items jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    p.id as proposal_id,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'itemId', pi.id,
          'targetKind', pi.target_kind,
          'base', case
            when pi.target_kind = 'person' then coalesce(
              p.base_snapshot -> 'person',
              jsonb_build_object('version', pi.base_version)
            )
            else jsonb_build_object('version', pi.base_version)
          end,
          'current', case
            when pi.target_kind = 'person' then (
              select jsonb_build_object(
                'version', person.version,
                'display_name', person.display_name,
                'recorded_sex', person.recorded_sex,
                'life_status', person.life_status,
                'visibility', person.visibility,
                'protected_minor', person.protected_minor,
                'primary_branch_id', person.primary_branch_id,
                'biography', person.biography,
                'confidence', person.confidence
              )
              from private.persons as person
              where person.id = pi.target_id and person.tree_id = p.tree_id
            )
            else null
          end,
          'proposed', jsonb_build_object(
            'baseVersion', pi.base_version,
            'changes', pi.field_changes
          ),
          'isStale', case
            when pi.target_kind = 'person' and pi.base_version is not null then exists (
              select 1 from private.persons as person
              where person.id = pi.target_id
                and person.tree_id = p.tree_id
                and person.version <> pi.base_version
            )
            else false
          end
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

create or replace function api.proposal_diff(p_proposal_id uuid)
returns table (
  proposal_id uuid,
  items jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from private.proposal_diff_authorized(p_proposal_id);
$$;

revoke all on function private.proposal_diff_authorized(uuid) from public, anon, authenticated;
revoke all on function api.proposal_diff(uuid) from public, anon, authenticated;
grant execute on function private.proposal_diff_authorized(uuid) to authenticated;
grant execute on function api.proposal_diff(uuid) to authenticated;

commit;