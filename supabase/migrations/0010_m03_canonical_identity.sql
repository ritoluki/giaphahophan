-- M03-01 canonical identity.
-- UUID and tree-scoped code are stable identifiers. Names and email addresses are never unique identity keys.

begin;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'persons_code_not_blank') then
    alter table private.persons add constraint persons_code_not_blank check (btrim(code) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'persons_display_name_not_blank') then
    alter table private.persons add constraint persons_display_name_not_blank check (btrim(display_name) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'person_names_name_not_blank') then
    alter table private.person_names add constraint person_names_name_not_blank check (btrim(name) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'person_names_search_not_blank') then
    alter table private.person_names add constraint person_names_search_not_blank check (btrim(name_search) <> '');
  end if;
end;
$$;

create index if not exists person_names_tree_search_idx
  on private.person_names (tree_id, name_search);

create index if not exists person_names_person_preferred_idx
  on private.person_names (tree_id, person_id, is_preferred desc, id);

create or replace function private.person_names_get_authorized(p_person_id uuid)
returns table (
  id uuid,
  person_id uuid,
  name text,
  name_search text,
  kind text,
  is_preferred boolean
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select
    n.id,
    n.person_id,
    n.name,
    n.name_search,
    n.kind,
    n.is_preferred
  from private.person_names as n
  join private.person_get_authorized(p_person_id) as p
    on p.id = n.person_id
   and p.tree_id = n.tree_id
  where n.person_id = p_person_id
  order by n.is_preferred desc, n.id;
$$;

create or replace function api.person_names_get(p_person_id uuid)
returns table (
  id uuid,
  person_id uuid,
  name text,
  name_search text,
  kind text,
  is_preferred boolean
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from private.person_names_get_authorized(p_person_id);
$$;

revoke all on function private.person_names_get_authorized(uuid) from public, anon, authenticated;
revoke all on function api.person_names_get(uuid) from public, anon, authenticated;
grant execute on function private.person_names_get_authorized(uuid) to anon, authenticated;
grant execute on function api.person_names_get(uuid) to anon, authenticated;

commit;
