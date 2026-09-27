-- M06-01: permission-aware canonical-name and alias search.
-- Search returns allowlisted person projections only; raw metadata stays private.

begin;

create index if not exists persons_tree_name_search_id_idx
  on private.persons (tree_id, name_search, id)
  where deleted_at is null;

create or replace function private.normalize_name_search(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select regexp_replace(
    btrim(translate(lower(p_value),
      'áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ',
      'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooouuuuuuuuuuuyyyyy')),
    '\s+', ' ', 'g'
  );
$$;

create or replace function private.persons_search_authorized(
  p_query text,
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
    select private.normalize_name_search(p_query) as query
  )
  select
    p.id,
    p.version,
    p.code,
    p.display_name,
    p.life_status,
    p.primary_branch_id,
    null::text as year_label,
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
  where p.deleted_at is null
    and normalized.query <> ''
    and (
      lower(p.code) = lower(btrim(p_query))
      or p.name_search like '%' || normalized.query || '%'
      or exists (
        select 1
        from private.person_names as n
        where n.person_id = p.id
          and n.tree_id = p.tree_id
          and n.name_search like '%' || normalized.query || '%'
      )
    )
    and (
      (p.visibility = 'public' and not p.protected_minor)
      or private.is_active_member(p.tree_id)
    )
  order by lower(p.display_name), p.id
  limit greatest(least(coalesce(p_limit, 20), 100), 1);
$$;

create or replace function api.persons_search(
  p_query text,
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
  select * from private.persons_search_authorized(p_query, p_limit);
$$;

revoke all on function private.normalize_name_search(text) from public, anon, authenticated;
revoke all on function private.persons_search_authorized(text, integer) from public, anon, authenticated;
revoke all on function api.persons_search(text, integer) from public, anon, authenticated;
grant execute on function private.normalize_name_search(text) to anon, authenticated;
grant execute on function private.persons_search_authorized(text, integer) to anon, authenticated;
grant execute on function api.persons_search(text, integer) to anon, authenticated;

commit;