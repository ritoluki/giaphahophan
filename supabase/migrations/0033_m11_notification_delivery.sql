-- M11-02: notification delivery state is private and provider-idempotent.
begin;

create table private.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  membership_id uuid not null,
  channel text not null check (channel in ('email', 'in_app')),
  event_kind text not null check (btrim(event_kind) <> ''),
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  unique (tree_id, id),
  unique (tree_id, membership_id, channel, event_kind),
  foreign key (tree_id, membership_id) references private.memberships(tree_id, id)
);

create table private.notifications (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  membership_id uuid not null,
  kind text not null check (btrim(kind) <> ''),
  resource_kind text not null check (btrim(resource_kind) <> ''),
  resource_id uuid not null,
  dedupe_key text not null check (btrim(dedupe_key) <> ''),
  read_at timestamptz,
  expires_at timestamptz,
  unique (tree_id, id),
  unique (tree_id, membership_id, dedupe_key),
  foreign key (tree_id, membership_id) references private.memberships(tree_id, id)
);

create table private.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  notification_id uuid not null,
  channel text not null check (channel in ('email', 'in_app')),
  status text not null check (status in ('queued', 'accepted', 'sent', 'failed', 'suppressed')),
  provider_message_id text,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  last_error_code text,
  unique (tree_id, id),
  unique (tree_id, channel, idempotency_key),
  foreign key (tree_id, notification_id) references private.notifications(tree_id, id),
  check (status not in ('accepted', 'sent') or nullif(btrim(provider_message_id), '') is not null)
);

create index notifications_recipient_idx on private.notifications (tree_id, membership_id, created_at desc);
create index delivery_attempts_status_idx on private.delivery_attempts (status, updated_at, id);

do $$
declare table_name text;
begin
  foreach table_name in array array['notification_preferences', 'notifications', 'delivery_attempts'] loop
    execute format('alter table private.%I enable row level security', table_name);
    execute format('alter table private.%I force row level security', table_name);
  end loop;
end;
$$;

revoke all on table private.notification_preferences, private.notifications, private.delivery_attempts from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on table private.notification_preferences, private.notifications, private.delivery_attempts to service_role;

commit;
