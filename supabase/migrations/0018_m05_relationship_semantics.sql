-- M05-02 relationship semantics: confirmed guardian/step paths are descriptive, never ancestry.
begin;

create or replace function private.person_kinship_authorized(
  p_from_person_id uuid,
  p_to_person_id uuid,
  p_include_adoptive boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_tree_id uuid;
  v_from_tree_id uuid;
  v_to_visible boolean;
  v_result jsonb;
begin
  select p.tree_id into v_from_tree_id
  from private.persons as p
  where p.id = p_from_person_id
    and p.deleted_at is null
    and ((p.visibility = 'public' and not p.protected_minor) or private.is_active_member(p.tree_id));

  if not found then
    return jsonb_build_object('status', 'not_found_within_visible_graph', 'paths', '[]'::jsonb, 'label', null, 'labelConfidence', 'unknown', 'visitedCount', 0, 'truncated', false);
  end if;

  select p.tree_id into v_tree_id
  from private.persons as p
  where p.id = p_to_person_id
    and p.tree_id = v_from_tree_id
    and p.deleted_at is null
    and ((p.visibility = 'public' and not p.protected_minor) or private.is_active_member(p.tree_id));
  v_to_visible := found;
  if not v_to_visible then
    return jsonb_build_object('status', 'not_found_within_visible_graph', 'paths', '[]'::jsonb, 'label', null, 'labelConfidence', 'unknown', 'visitedCount', 0, 'truncated', false);
  end if;

  with recursive
  visible_people as (
    select p.id, p.version, p.code, p.display_name, p.life_status, p.primary_branch_id, t.data_mode
    from private.persons as p
    join private.trees as t on t.id = p.tree_id
    where p.tree_id = v_tree_id
      and p.deleted_at is null
      and ((p.visibility = 'public' and not p.protected_minor) or private.is_active_member(p.tree_id))
  ),
  kin_edges(source_person_id, target_person_id, via) as (
    select pl.parent_id, pl.child_id,
           case pl.kind when 'adoptive' then 'adoptive_child' when 'guardian' then 'guardian_child' when 'step' then 'step_child' else 'child' end
    from private.parent_links as pl
    join visible_people as source on source.id = pl.parent_id
    join visible_people as target on target.id = pl.child_id
    where pl.tree_id = v_tree_id
      and pl.deleted_at is null
      and pl.status = 'confirmed'
      and pl.kind in ('biological', 'adoptive', 'guardian', 'step')
      and (pl.kind <> 'adoptive' or p_include_adoptive)
    union all
    select pl.child_id, pl.parent_id,
           case pl.kind when 'adoptive' then 'adoptive_parent' when 'guardian' then 'guardian_parent' when 'step' then 'step_parent' else 'parent' end
    from private.parent_links as pl
    join visible_people as source on source.id = pl.child_id
    join visible_people as target on target.id = pl.parent_id
    where pl.tree_id = v_tree_id
      and pl.deleted_at is null
      and pl.status = 'confirmed'
      and pl.kind in ('biological', 'adoptive', 'guardian', 'step')
      and (pl.kind <> 'adoptive' or p_include_adoptive)
    union all
    select left_partner.person_id, right_partner.person_id, 'partner'
    from private.union_partners as left_partner
    join private.union_partners as right_partner
      on right_partner.tree_id = left_partner.tree_id
     and right_partner.union_id = left_partner.union_id
     and right_partner.person_id <> left_partner.person_id
    join private.unions as u
      on u.tree_id = left_partner.tree_id
     and u.id = left_partner.union_id
    join visible_people as source on source.id = left_partner.person_id
    join visible_people as target on target.id = right_partner.person_id
    where left_partner.tree_id = v_tree_id
      and u.status <> 'unknown'
  ),
  walk(person_id, path, vias, depth) as (
    select p_from_person_id, array[p_from_person_id]::uuid[], array['start']::text[], 0
    union all
    select e.target_person_id, w.path || e.target_person_id, w.vias || e.via, w.depth + 1
    from walk as w
    join kin_edges as e on e.source_person_id = w.person_id
    where w.depth < 12
      and not (e.target_person_id = any(w.path))
  ),
  walk_bounded as (
    select * from walk limit 10001
  ),
  path_rows as (
    select w.depth,
           (select jsonb_agg(jsonb_build_object(
              'person', jsonb_build_object(
                'id', vp.id,
                'version', vp.version,
                'code', vp.code,
                'displayName', vp.display_name,
                'lifeStatus', vp.life_status,
                'primaryBranchId', vp.primary_branch_id,
                'isDemo', vp.data_mode = 'demo'
              ),
              'via', w.vias[s.index]
            ) order by s.index)
            from generate_subscripts(w.path, 1) as s(index)
            join visible_people as vp on vp.id = w.path[s.index]) as path_json
    from walk_bounded as w
    where w.person_id = p_to_person_id
    order by w.depth, w.path
    limit 3
  ),
  first_path as (
    select path_json from path_rows order by depth limit 1
  )
  select jsonb_build_object(
    'status', case
      when exists (select 1 from path_rows) then 'found'
      when (select count(*) from walk_bounded) > 10000 then 'limit_reached'
      when exists (
        select 1 from walk_bounded as w
        where w.depth = 12
          and exists (select 1 from kin_edges as e where e.source_person_id = w.person_id and not (e.target_person_id = any(w.path)))
      ) then 'limit_reached'
      else 'not_found_within_visible_graph'
    end,
    'paths', coalesce((select jsonb_agg(path_json order by depth) from path_rows), '[]'::jsonb),
    'label', case
      when not exists (select 1 from first_path) then null
      when jsonb_array_length((select path_json from first_path)) = 1 then 'Cùng một hồ sơ'
      when (select path_json -> 1 ->> 'via' from first_path) = 'child' then 'con'
      when (select path_json -> 1 ->> 'via' from first_path) = 'parent' then 'cha/mẹ'
      when (select path_json -> 1 ->> 'via' from first_path) = 'adoptive_child' then 'con nuôi'
      when (select path_json -> 1 ->> 'via' from first_path) = 'adoptive_parent' then 'cha/mẹ nuôi'
      when (select path_json -> 1 ->> 'via' from first_path) = 'guardian_child' then 'người được giám hộ'
      when (select path_json -> 1 ->> 'via' from first_path) = 'guardian_parent' then 'người giám hộ'
      when (select path_json -> 1 ->> 'via' from first_path) = 'step_child' then 'con riêng'
      when (select path_json -> 1 ->> 'via' from first_path) = 'step_parent' then 'cha/mẹ kế'
      when (select path_json -> 1 ->> 'via' from first_path) = 'partner' then 'bạn đời'
      else 'Đường nối theo dữ liệu'
    end,
    'labelConfidence', case
      when not exists (select 1 from first_path) then 'unknown'
      when jsonb_array_length((select path_json from first_path)) = 1 then 'reviewed_rule'
      when (select path_json -> 1 ->> 'via' from first_path) in ('child', 'parent', 'adoptive_child', 'adoptive_parent') and jsonb_array_length((select path_json from first_path)) = 2 then 'reviewed_rule'
      else 'descriptive_only'
    end,
    'visitedCount', (select count(distinct person_id) from walk_bounded),
    'truncated', (select count(*) > 10000 from walk_bounded) or exists (
      select 1 from walk_bounded as w
      where w.depth = 12
        and exists (select 1 from kin_edges as e where e.source_person_id = w.person_id and not (e.target_person_id = any(w.path)))
    )
  ) into v_result;

  return v_result;
end;
$$;


commit;
