-- M16-04: reserve stable canonical UUIDs for external records before any apply.
-- This private map is not a canonical person/edge write and is never readable by clients.
begin;

create table private.external_id_map (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id) on delete cascade,
  source_namespace text not null check (length(btrim(source_namespace)) between 1 and 200),
  external_id text not null check (length(btrim(external_id)) between 1 and 300),
  entity_kind text not null check (entity_kind in ('person','family')),
  canonical_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  unique(tree_id, source_namespace, external_id, entity_kind),
  unique(tree_id, canonical_id)
);

alter table private.external_id_map enable row level security;
alter table private.external_id_map force row level security;
revoke all on private.external_id_map from public, anon, authenticated;

create or replace function private.map_staged_external_id()
returns trigger language plpgsql security definer
set search_path=pg_catalog,private
as $$
declare
  v_namespace text;
  v_entity_kind text;
begin
  if new.external_id is null or new.normalized is null then return new; end if;
  select j.source_namespace into v_namespace
  from private.import_jobs j
  where j.id=new.job_id and j.tree_id=new.tree_id and j.created_by=new.created_by;
  if v_namespace is null then
    raise exception using errcode='23503',message='staged import job is unavailable';
  end if;
  v_entity_kind:=case when new.normalized->>'recordType'='FAM' then 'family' else 'person' end;
  insert into private.external_id_map(tree_id,source_namespace,external_id,entity_kind,created_by)
  values(new.tree_id,v_namespace,btrim(new.external_id),v_entity_kind,new.created_by)
  on conflict(tree_id,source_namespace,external_id,entity_kind) do nothing;
  return new;
end;
$$;

create trigger import_rows_stable_external_id
  before insert on private.import_rows
  for each row execute function private.map_staged_external_id();

revoke all on function private.map_staged_external_id() from public,anon,authenticated;
comment on table private.external_id_map is
  'M16-04 stable, tree-scoped UUID reservations for staged external identities; canonical rows are created only by a separately authorized apply operation.';

commit;
