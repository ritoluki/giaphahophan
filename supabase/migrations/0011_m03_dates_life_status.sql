-- M03-02 date precision and privacy projection.
-- Year-only values keep month/day absent; unknown/living people are not public.

begin;

create table if not exists private.person_facts (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  person_id uuid not null,
  kind text not null check (kind in ('birth', 'death', 'burial', 'occupation', 'other')),
  value_date jsonb,
  value_text text,
  confidence text not null default 'unverified' check (confidence in ('unverified', 'supported', 'verified', 'disputed')),
  visibility text not null default 'restricted' check (visibility in ('public', 'members', 'restricted')),
  unique (tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id),
  check (value_date is not null or nullif(btrim(value_text), '') is not null)
);

create index if not exists person_facts_person_idx
  on private.person_facts (tree_id, person_id, kind, id);

drop trigger if exists touch_person_facts on private.person_facts;
create trigger touch_person_facts
before update on private.person_facts
for each row execute function private.touch_updated_at();

alter table private.person_facts enable row level security;
alter table private.person_facts force row level security;
revoke all on table private.person_facts from public, anon, authenticated;

create or replace function private.person_facts_get_authorized(p_person_id uuid)
returns table (
  id uuid,
  person_id uuid,
  kind text,
  value_date jsonb,
  value_text text,
  confidence text,
  visibility text
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select
    f.id,
    f.person_id,
    f.kind,
    f.value_date,
    f.value_text,
    f.confidence,
    f.visibility
  from private.person_facts as f
  join private.person_get_authorized(p_person_id) as p
    on p.id = f.person_id
   and p.tree_id = f.tree_id
  where f.person_id = p_person_id
    and (
      private.is_active_member(p.tree_id)
      or (f.visibility = 'public' and p.life_status = 'deceased')
    )
  order by f.id;
$$;

create or replace function api.person_facts_get(p_person_id uuid)
returns table (
  id uuid,
  person_id uuid,
  kind text,
  value_date jsonb,
  value_text text,
  confidence text,
  visibility text
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from private.person_facts_get_authorized(p_person_id);
$$;

create or replace function private.person_get_authorized(p_person_id uuid)
returns table (
  id uuid,
  tree_id uuid,
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

revoke all on function private.person_facts_get_authorized(uuid) from public, anon, authenticated;
revoke all on function api.person_facts_get(uuid) from public, anon, authenticated;
grant execute on function private.person_facts_get_authorized(uuid) to anon, authenticated;
grant execute on function api.person_facts_get(uuid) to anon, authenticated;

commit;
