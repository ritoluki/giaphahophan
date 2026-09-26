-- P0 foundation migration. Local/staging migration source of truth.
-- This migration is deliberately fail-closed: private tables have RLS enabled,
-- no table grants are opened, and authorization RPCs are added in P2.

begin;

create extension if not exists pgcrypto;

create schema if not exists private;
create schema if not exists api;
create schema if not exists jobs;

create table private.trees (
  id uuid primary key default gen_random_uuid(),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  slug text not null unique,
  name text not null,
  data_mode text not null check (data_mode in ('demo', 'real')),
  policy_version bigint not null default 1,
  graph_revision bigint not null default 1,
  settings jsonb not null default '{}'::jsonb
);

create table private.branches (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  code text not null,
  name text not null,
  parent_branch_id uuid,
  founder_person_id uuid,
  description text,
  visibility text not null default 'restricted' check (visibility in ('public', 'members', 'restricted')),
  unique (tree_id, id),
  unique (tree_id, code),
  check (parent_branch_id is null or parent_branch_id <> id)
);

create table private.persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  code text not null,
  display_name text not null,
  name_search text not null,
  recorded_sex text check (recorded_sex in ('M', 'F', 'X', 'U')),
  life_status text not null default 'unknown' check (life_status in ('living', 'deceased', 'unknown')),
  visibility text not null default 'restricted' check (visibility in ('public', 'members', 'restricted')),
  protected_minor boolean not null default false,
  primary_branch_id uuid,
  biography text,
  confidence text not null default 'unverified' check (confidence in ('unverified', 'supported', 'verified', 'disputed')),
  merged_into_id uuid,
  deleted_at timestamptz,
  unique (tree_id, id),
  unique (tree_id, code),
  check (merged_into_id is null or merged_into_id <> id)
);

alter table private.branches
  add constraint branches_parent_same_tree_fk foreign key (tree_id, parent_branch_id) references private.branches(tree_id, id),
  add constraint branches_founder_same_tree_fk foreign key (tree_id, founder_person_id) references private.persons(tree_id, id);

alter table private.persons
  add constraint persons_primary_branch_same_tree_fk foreign key (tree_id, primary_branch_id) references private.branches(tree_id, id),
  add constraint persons_merged_same_tree_fk foreign key (tree_id, merged_into_id) references private.persons(tree_id, id);

create table private.person_names (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  person_id uuid not null,
  name text not null,
  name_search text not null,
  kind text not null check (kind in ('birth', 'preferred', 'alias', 'religious', 'other')),
  is_preferred boolean not null default false,
  unique (tree_id, id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id)
);

create table private.sources (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  kind text not null check (kind in ('book', 'oral', 'document', 'photo', 'website', 'other')),
  provenance text not null,
  visibility text not null default 'restricted' check (visibility in ('public', 'members', 'restricted')),
  rights_note text,
  unique (tree_id, id)
);

create table private.parent_links (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  parent_id uuid not null,
  child_id uuid not null,
  kind text not null check (kind in ('biological', 'adoptive', 'guardian', 'step')),
  status text not null check (status in ('confirmed', 'disputed')),
  ordinal integer check (ordinal is null or ordinal > 0),
  source_id uuid not null,
  deleted_at timestamptz,
  unique (tree_id, id),
  unique (tree_id, parent_id, child_id, kind),
  check (parent_id <> child_id),
  foreign key (tree_id, parent_id) references private.persons(tree_id, id),
  foreign key (tree_id, child_id) references private.persons(tree_id, id),
  foreign key (tree_id, source_id) references private.sources(tree_id, id)
);

create table private.memberships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  auth_user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'admin', 'reviewer', 'editor', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'revoked')),
  person_id uuid,
  approved_by uuid references auth.users(id) on delete set null,
  unique (tree_id, id),
  unique (tree_id, auth_user_id),
  foreign key (tree_id, person_id) references private.persons(tree_id, id)
);

create table private.capability_grants (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  membership_id uuid not null,
  capability text not null,
  branch_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  unique (tree_id, id),
  foreign key (tree_id, membership_id) references private.memberships(tree_id, id),
  foreign key (tree_id, branch_id) references private.branches(tree_id, id)
);

create table private.proposals (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'needs_info', 'approved', 'rejected', 'withdrawn')),
  kind text not null check (kind in ('correction', 'addition', 'relationship', 'merge', 'publication')),
  reason text not null,
  branch_id uuid,
  base_snapshot jsonb,
  unique (tree_id, id),
  foreign key (tree_id, branch_id) references private.branches(tree_id, id)
);

create table private.proposal_items (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  proposal_id uuid not null,
  target_kind text not null check (target_kind in ('person', 'fact', 'parent_link', 'union', 'branch', 'merge', 'publication')),
  target_id uuid,
  base_version bigint,
  operation text not null check (operation in ('create', 'update', 'delete', 'merge', 'publish')),
  field_changes jsonb not null,
  source_ids uuid[] not null default '{}',
  unique (tree_id, id),
  foreign key (tree_id, proposal_id) references private.proposals(tree_id, id)
);

create table private.review_decisions (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  proposal_id uuid not null,
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approve', 'reject', 'needs_info')),
  reason text not null,
  base_version bigint not null,
  reviewed_snapshot_hash text not null,
  foreign key (tree_id, proposal_id) references private.proposals(tree_id, id),
  unique (tree_id, id)
);

create table private.audit_events (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_kind text not null,
  resource_id uuid,
  request_id uuid not null,
  redacted_summary text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table private.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  actor_id uuid references auth.users(id) on delete set null,
  operation text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (tree_id, actor_id, operation, idempotency_key)
);

create table private.outbox (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  created_at timestamptz not null default now(),
  event_type text not null,
  resource_id uuid,
  resource_version bigint,
  dedupe_key text not null unique,
  requested_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  attempts integer not null default 0,
  last_error_code text
);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
begin
  new.updated_at = clock_timestamp();
  new.version = old.version + 1;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['trees','branches','persons','person_names','sources','parent_links','memberships','capability_grants','proposals','proposal_items','review_decisions'] loop
    execute format('create trigger %I before update on private.%I for each row execute function private.touch_updated_at()', 'touch_' || table_name, table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['trees','branches','persons','person_names','sources','parent_links','memberships','capability_grants','proposals','proposal_items','review_decisions','audit_events','idempotency_records','outbox'] loop
    execute format('alter table private.%I enable row level security', table_name);
    execute format('alter table private.%I force row level security', table_name);
  end loop;
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on schema jobs from public, anon, authenticated;
revoke all on schema api from public, anon;

comment on schema private is 'Raw genealogy data. Never expose through the Data API.';
comment on table private.persons is 'Canonical people; not auth accounts. Projections must be field-authorized.';
comment on table private.parent_links is 'Source-backed directed relationships. Cycle enforcement is added with domain/RPC tests in P2.';

commit;
