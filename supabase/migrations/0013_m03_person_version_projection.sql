-- M03-05 expose canonical person version for If-Match/baseVersion workflows.

begin;

create or replace function private.person_get_authorized_versioned(p_person_id uuid)
returns table (
  id uuid,
  tree_id uuid,
  version bigint,
  code text,
  display_name text,
  recorded_sex text,
  life_status text,
  visibility text,
  protected_minor boolean,
  primary_branch_id uuid,
  confidence text
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select
    p.id,
    p.tree_id,
    p.version,
    p.code,
    p.display_name,
    p.recorded_sex,
    p.life_status,
    p.visibility,
    p.protected_minor,
    p.primary_branch_id,
    p.confidence
  from private.persons as p
  where p.id = p_person_id
    and (
      (p.visibility = 'public' and p.life_status = 'deceased' and not p.protected_minor)
      or private.is_active_member(p.tree_id)
    );
$$;

drop function if exists api.person_get(uuid);

create function api.person_get(p_person_id uuid)
returns table (
  id uuid,
  tree_id uuid,
  version bigint,
  code text,
  display_name text,
  recorded_sex text,
  life_status text,
  visibility text,
  protected_minor boolean,
  primary_branch_id uuid,
  confidence text
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from private.person_get_authorized_versioned(p_person_id);
$$;

revoke all on function private.person_get_authorized_versioned(uuid) from public, anon, authenticated;
grant execute on function private.person_get_authorized_versioned(uuid) to anon, authenticated;
revoke all on function api.person_get(uuid) from public, anon, authenticated;
grant execute on function api.person_get(uuid) to anon, authenticated;

commit;
