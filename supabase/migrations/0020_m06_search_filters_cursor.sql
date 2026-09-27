-- M06-02: permission-aware filters and stable keyset cursor.
-- Cursor contains only an opaque UUID token; filter predicates run inside the authorized projection.

begin;

drop function if exists api.persons_search(text, integer);
drop function if exists private.persons_search_authorized(text, integer);

create index if not exists person_facts_birth_year_search_idx
  on private.person_facts (tree_id, (value_date ->> 'year'), person_id)
  where kind = 'birth' and value_date is not null;

create or replace function private.persons_search_authorized(
  p_query text,
  p_branch_id uuid default null,
  p_life_status text default null,
  p_birth_year integer default null,
  p_sort text default 'name',
  p_cursor_person_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  version bigint,
  code text,
  display_name text,
  life_status text,
  primary_branch_id uuid,
  year_label text,
  portrait_asset_id uuid,
  is_demo boolean,
  matched_names jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  with normalized as (
    select coalesce(private.normalize_name_search(p_query), '') as query
  ), cursor_row as (
    select c.id, c.display_name, c.code, c.updated_at
    from private.persons as c
    where c.id = p_cursor_person_id
      and c.deleted_at is null
  )
  select
    p.id,
    p.version,
    p.code,
    p.display_name,
    p.life_status,
    p.primary_branch_id,
    (
      select f.value_date ->> 'year'
      from private.person_facts as f
      where f.person_id = p.id
        and f.tree_id = p.tree_id
        and f.kind = 'birth'
        and f.value_date is not null
        and (
          private.is_active_member(p.tree_id)
          or (f.visibility = 'public' and p.life_status = 'deceased')
        )
      order by f.id
      limit 1
    ) as year_label,
    null::uuid as portrait_asset_id,
    (t.data_mode = 'demo') as is_demo,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('name', n.name, 'kind', n.kind)
        order by n.is_preferred desc, n.id
      )
      from private.person_names as n
      cross join normalized
      where n.person_id = p.id
        and n.tree_id = p.tree_id
        and n.name_search like '%' || normalized.query || '%'
    ), '[]'::jsonb) as matched_names
  from private.persons as p
  join private.trees as t on t.id = p.tree_id
  cross join normalized
  left join cursor_row as c on true
  where p.deleted_at is null
    and (
      normalized.query = '' or (
      p.name_search like '%' || normalized.query || '%'
      or lower(p.code) = lower(btrim(p_query))
      or exists (
        select 1
        from private.person_names as n
        where n.person_id = p.id
          and n.tree_id = p.tree_id
          and n.name_search like '%' || normalized.query || '%'
      )
      )
    )
    and (p_branch_id is null or p.primary_branch_id = p_branch_id)
    and (p_life_status is null or p.life_status = p_life_status)
    and (
      p_birth_year is null
      or exists (
        select 1
        from private.person_facts as f
        where f.person_id = p.id
          and f.tree_id = p.tree_id
          and f.kind = 'birth'
          and f.value_date ->> 'year' = p_birth_year::text
          and (
            private.is_active_member(p.tree_id)
            or (f.visibility = 'public' and p.life_status = 'deceased')
          )
      )
    )
    and (
      (p.visibility = 'public' and not p.protected_minor)
      or private.is_active_member(p.tree_id)
    )
    and (
      p_cursor_person_id is null
      or (c.id is not null and case
        when p_sort = 'code' then (lower(p.code), p.id) > (lower(c.code), c.id)
        when p_sort = 'updated' then (p.updated_at, p.id) < (c.updated_at, c.id)
        else (lower(p.display_name), p.id) > (lower(c.display_name), c.id)
      end)
    )
  order by
    case when p_sort = 'code' then lower(p.code) end asc,
    case when p_sort = 'updated' then p.updated_at end desc,
    case when p_sort not in ('code', 'updated') then lower(p.display_name) end asc,
    p.id asc
  limit greatest(least(coalesce(p_limit, 20), 101), 1);
$$;

create or replace function api.persons_search(
  p_query text default null,
  p_branch_id uuid default null,
  p_life_status text default null,
  p_birth_year integer default null,
  p_sort text default 'name',
  p_cursor_person_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  version bigint,
  code text,
  display_name text,
  life_status text,
  primary_branch_id uuid,
  year_label text,
  portrait_asset_id uuid,
  is_demo boolean,
  matched_names jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from private.persons_search_authorized(p_query, p_branch_id, p_life_status, p_birth_year, p_sort, p_cursor_person_id, p_limit);
$$;

revoke all on function private.persons_search_authorized(text, uuid, text, integer, text, uuid, integer) from public, anon, authenticated;
revoke all on function api.persons_search(text, uuid, text, integer, text, uuid, integer) from public, anon, authenticated;
grant execute on function private.persons_search_authorized(text, uuid, text, integer, text, uuid, integer) to anon, authenticated;
grant execute on function api.persons_search(text, uuid, text, integer, text, uuid, integer) to anon, authenticated;

commit;