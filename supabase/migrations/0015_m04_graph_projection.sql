-- M04-01 graph projection. The graph is a permission-filtered read projection.
-- Union/adoption data stays canonical; occurrence IDs are path-scoped for pedigree collapse.
begin;

create table private.unions (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('marriage', 'partnership', 'unknown')),
  status text not null check (status in ('active', 'separated', 'divorced', 'widowed', 'unknown')),
  unique (tree_id, id)
);

create table private.union_partners (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  union_id uuid not null,
  person_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  unique (tree_id, id),
  unique (tree_id, union_id, person_id),
  foreign key (tree_id, union_id) references private.unions(tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id)
);

create table private.union_children (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  union_id uuid not null,
  person_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  unique (tree_id, id),
  unique (tree_id, union_id, person_id),
  foreign key (tree_id, union_id) references private.unions(tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id)
);

alter table private.unions enable row level security;
alter table private.union_partners enable row level security;
alter table private.union_children enable row level security;

create or replace function private.person_graph_authorized(
  p_person_id uuid,
  p_direction text,
  p_depth integer default 3,
  p_max_nodes integer default 120
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_tree_id uuid;
  v_graph_revision bigint;
  v_result jsonb;
begin
  if p_direction not in ('ancestors', 'descendants', 'family', 'roots') then
    raise exception using errcode = '22023', message = 'unsupported graph direction';
  end if;
  if p_depth < 1 or p_depth > 6 or p_max_nodes < 1 or p_max_nodes > 300 then
    raise exception using errcode = '22023', message = 'graph bounds are invalid';
  end if;

  select p.tree_id
  into v_tree_id
  from private.persons as p
  where p.id = p_person_id
    and p.deleted_at is null
    and (
      (p.visibility = 'public' and not p.protected_minor)
      or private.is_active_member(p.tree_id)
    );

  if not found and p_direction <> 'roots' then
    raise exception using errcode = 'P0002', message = 'person graph root not found';
  end if;

  if p_direction = 'roots' then
    select t.id, t.graph_revision
    into v_tree_id, v_graph_revision
    from private.trees as t
    where t.id = (
      select p.tree_id
      from private.persons as p
      where p.id = p_person_id
        and p.deleted_at is null
        and (
          (p.visibility = 'public' and not p.protected_minor)
          or private.is_active_member(p.tree_id)
        )
    );
  else
    select t.graph_revision
    into v_graph_revision
    from private.trees as t
    where t.id = v_tree_id;
  end if;

  if v_tree_id is null then
    raise exception using errcode = 'P0002', message = 'person graph tree not found';
  end if;

  with recursive
  visible_people as (
    select p.id, p.tree_id, p.version, p.code, p.display_name, p.life_status,
           p.primary_branch_id, p.visibility, t.data_mode
    from private.persons as p
    join private.trees as t on t.id = p.tree_id
    where p.tree_id = v_tree_id
      and p.deleted_at is null
      and (
        (p.visibility = 'public' and not p.protected_minor)
        or private.is_active_member(p.tree_id)
      )
  ),
  walk(person_id, depth, path, edge_id, source_person_id, target_person_id, edge_kind, edge_status) as (
    select p.id, 0, array[p.id]::uuid[], null::uuid, null::uuid, null::uuid, null::text, null::text
    from visible_people as p
    where (p_direction <> 'roots' and p.id = p_person_id)
       or (
         p_direction = 'roots'
         and not exists (
           select 1 from private.parent_links as pl
           where pl.tree_id = v_tree_id
             and pl.deleted_at is null
             and pl.child_id = p.id
         )
       )
    union all
    select n.person_id, w.depth + 1, w.path || n.person_id, n.edge_id,
           n.source_person_id, n.target_person_id, n.edge_kind, n.edge_status
    from walk as w
    cross join lateral (
      select pl.parent_id as person_id, pl.id as edge_id,
             pl.parent_id as source_person_id, pl.child_id as target_person_id,
             pl.kind as edge_kind, pl.status as edge_status
      from private.parent_links as pl
      join visible_people as vp on vp.id = pl.parent_id
      where p_direction in ('ancestors', 'family')
        and pl.tree_id = v_tree_id
        and pl.deleted_at is null
        and pl.child_id = w.person_id
      union all
      select pl.child_id, pl.id, pl.parent_id, pl.child_id, pl.kind, pl.status
      from private.parent_links as pl
      join visible_people as vp on vp.id = pl.child_id
      where p_direction in ('descendants', 'family')
        and pl.tree_id = v_tree_id
        and pl.deleted_at is null
        and pl.parent_id = w.person_id
      union all
      select partner.person_id, u.id, w.person_id, partner.person_id, 'union', null
      from private.union_partners as current_partner
      join private.union_partners as partner
        on partner.tree_id = current_partner.tree_id
       and partner.union_id = current_partner.union_id
       and partner.person_id <> current_partner.person_id
      join private.unions as u
        on u.tree_id = current_partner.tree_id
       and u.id = current_partner.union_id
      join visible_people as vp on vp.id = partner.person_id
      where p_direction = 'family'
        and current_partner.tree_id = v_tree_id
        and current_partner.person_id = w.person_id
        and u.status <> 'unknown'
      union all
      select child.person_id, u.id, w.person_id, child.person_id, 'union', null
      from private.union_partners as current_partner
      join private.union_children as child
        on child.tree_id = current_partner.tree_id
       and child.union_id = current_partner.union_id
      join private.unions as u
        on u.tree_id = current_partner.tree_id
       and u.id = current_partner.union_id
      join visible_people as vp on vp.id = child.person_id
      where p_direction = 'family'
        and current_partner.tree_id = v_tree_id
        and current_partner.person_id = w.person_id
        and u.status <> 'unknown'
    ) as n
    where w.depth < p_depth
      and not (n.person_id = any(w.path))
  ),
  walk_rows as (
    select w.*, row_number() over (order by w.depth, w.path, w.person_id, coalesce(w.edge_id, '00000000-0000-0000-0000-000000000000'::uuid)) as row_number
    from walk as w
  ),
  selected as (
    select * from walk_rows where row_number <= p_max_nodes
  ),
  node_rows as (
    select s.*, vp.version, vp.code, vp.display_name, vp.life_status,
           vp.primary_branch_id, vp.data_mode,
           md5(array_to_string(s.path, '/') || ':' || p_direction) as occurrence_id
    from selected as s
    join visible_people as vp on vp.id = s.person_id
  ),
  all_edges as (
    select
      s.edge_id,
      s.edge_kind,
      s.edge_status,
      case when s.source_person_id = s.person_id
        then s.path
        else s.path[1:array_length(s.path, 1) - 1]
      end as source_path,
      case when s.target_person_id = s.person_id
        then s.path
        else s.path[1:array_length(s.path, 1) - 1]
      end as target_path
    from selected as s
    where s.edge_id is not null
  ),
  edge_rows as (
    select
      coalesce(e.edge_id::text, md5(array_to_string(e.source_path, '/') || array_to_string(e.target_path, '/'))) as edge_key,
      md5(array_to_string(e.source_path, '/') || ':' || p_direction) as source_occurrence_id,
      md5(array_to_string(e.target_path, '/') || ':' || p_direction) as target_occurrence_id,
      e.edge_kind,
      e.edge_status
    from all_edges as e
    where exists (select 1 from selected s where s.path = e.source_path)
      and exists (select 1 from selected s where s.path = e.target_path)
  )
  select jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'occurrenceId', n.occurrence_id,
        'person', jsonb_build_object(
          'id', n.person_id,
          'version', n.version,
          'code', n.code,
          'displayName', n.display_name,
          'lifeStatus', n.life_status,
          'primaryBranchId', n.primary_branch_id,
          'isDemo', n.data_mode = 'demo'
        ),
        'depth', n.depth
      ) order by n.depth, n.path)
      from node_rows as n
    ), '[]'::jsonb),
    'edges',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.edge_key,
        'sourceOccurrenceId', e.source_occurrence_id,
        'targetOccurrenceId', e.target_occurrence_id,
        'kind', e.edge_kind,
        'status', e.edge_status
      ) order by e.source_occurrence_id, e.target_occurrence_id, e.edge_key)
      from edge_rows as e
    ), '[]'::jsonb),
    'roots',
    coalesce((
      select jsonb_agg(n.occurrence_id order by n.occurrence_id)
      from node_rows as n
      where n.depth = 0
    ), '[]'::jsonb),
    'graphRevision', v_graph_revision,
    'truncated', (select count(*) > p_max_nodes from walk),
    'reason', case
      when (select count(*) > p_max_nodes from walk) then 'node_limit'
      when exists (select 1 from walk where depth = p_depth) then 'depth_limit'
      else null
    end,
    'expandablePersonIds',
    coalesce((
      select jsonb_agg(distinct n.person_id)
      from node_rows as n
      where n.depth < p_depth
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function api.person_graph(
  p_person_id uuid,
  p_direction text default 'family',
  p_depth integer default 3,
  p_max_nodes integer default 120
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.person_graph_authorized(p_person_id, p_direction, p_depth, p_max_nodes);
$$;

revoke all on function private.person_graph_authorized(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function private.person_graph_authorized(uuid, text, integer, integer) to anon, authenticated;
revoke all on function api.person_graph(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function api.person_graph(uuid, text, integer, integer) to anon, authenticated;

commit;
