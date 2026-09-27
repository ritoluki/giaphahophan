-- M14-01 balanced VND ledger foundation. Synthetic/demo-only until later approval workflow phases.
begin;

create table private.funds (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 500),
  currency text not null default 'VND' check (currency = 'VND'),
  closed_through date,
  visibility text not null default 'members' check (visibility in ('public', 'members', 'restricted')),
  unique (tree_id, id)
);

create table private.fund_accounts (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  fund_id uuid not null,
  code text not null check (length(btrim(code)) between 1 and 50),
  kind text not null check (kind in ('asset', 'income', 'expense', 'equity')),
  name text not null check (length(btrim(name)) between 1 and 500),
  unique (tree_id, fund_id, id),
  unique (tree_id, fund_id, code),
  foreign key (tree_id, fund_id) references private.funds(tree_id, id)
);

create table private.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  fund_id uuid not null,
  code text not null check (length(btrim(code)) between 1 and 100),
  entry_date date not null,
  description text not null check (length(btrim(description)) between 1 and 5000),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'posted', 'rejected')),
  submitted_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  posted_at timestamptz,
  reverses_entry_id uuid,
  proof_asset_id uuid,
  donor_person_id uuid,
  unique (tree_id, fund_id, id),
  unique (tree_id, code),
  check (approved_by is null or approved_by <> submitted_by),
  check (reverses_entry_id is null or reverses_entry_id <> id),
  foreign key (tree_id, fund_id) references private.funds(tree_id, id),
  foreign key (tree_id, fund_id, reverses_entry_id) references private.journal_entries(tree_id, fund_id, id) deferrable initially deferred,
  foreign key (tree_id, proof_asset_id) references private.media_assets(tree_id, id),
  foreign key (tree_id, donor_person_id) references private.persons(tree_id, id)
);

create table private.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references private.trees(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  fund_id uuid not null,
  entry_id uuid not null,
  account_id uuid not null,
  signed_amount_vnd bigint not null check (signed_amount_vnd <> 0),
  foreign key (tree_id, fund_id, entry_id) references private.journal_entries(tree_id, fund_id, id) on delete restrict,
  foreign key (tree_id, fund_id, account_id) references private.fund_accounts(tree_id, fund_id, id) on delete restrict
);

create index journal_entries_report_idx on private.journal_entries (tree_id, fund_id, entry_date, id);
create index journal_lines_entry_idx on private.journal_lines (tree_id, fund_id, entry_id, id);
create index journal_lines_account_idx on private.journal_lines (tree_id, fund_id, account_id, id);

create or replace function private.touch_fund_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, private as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists touch_funds on private.funds;
create trigger touch_funds before update on private.funds for each row execute function private.touch_fund_updated_at();
drop trigger if exists touch_fund_accounts on private.fund_accounts;
create trigger touch_fund_accounts before update on private.fund_accounts for each row execute function private.touch_fund_updated_at();
drop trigger if exists touch_journal_entries on private.journal_entries;
create trigger touch_journal_entries before update on private.journal_entries for each row execute function private.touch_fund_updated_at();
drop trigger if exists touch_journal_lines on private.journal_lines;
create trigger touch_journal_lines before update on private.journal_lines for each row execute function private.touch_fund_updated_at();

create or replace function private.assert_journal_entry_balanced()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_status text;
  v_count integer;
  v_total bigint;
  v_tree_id uuid;
  v_entry_id uuid;
begin
  v_tree_id := coalesce((to_jsonb(new)->>'tree_id')::uuid, (to_jsonb(old)->>'tree_id')::uuid);
  v_entry_id := case when tg_table_name = 'journal_entries'
    then coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid)
    else coalesce((to_jsonb(new)->>'entry_id')::uuid, (to_jsonb(old)->>'entry_id')::uuid)
  end;
  select e.status into v_status
  from private.journal_entries e
  where e.tree_id = v_tree_id and e.id = v_entry_id;
  if v_status = 'posted' then
    select count(*)::integer, coalesce(sum(l.signed_amount_vnd), 0)::bigint
    into v_count, v_total
    from private.journal_lines l
    where l.tree_id = v_tree_id and l.entry_id = v_entry_id;
    if v_count < 2 or v_total <> 0 then
      raise exception using errcode = '23514', message = 'posted journal must have at least two lines totaling zero';
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists journal_entry_balance_guard on private.journal_entries;
create constraint trigger journal_entry_balance_guard
after insert or update of status on private.journal_entries
deferrable initially deferred for each row execute function private.assert_journal_entry_balanced();
drop trigger if exists journal_line_balance_guard on private.journal_lines;
create constraint trigger journal_line_balance_guard
after insert or update or delete on private.journal_lines
deferrable initially deferred for each row execute function private.assert_journal_entry_balanced();

do $$
declare
  table_name text;
begin
  foreach table_name in array array['funds', 'fund_accounts', 'journal_entries', 'journal_lines'] loop
    execute format('alter table private.%I enable row level security', table_name);
    execute format('alter table private.%I force row level security', table_name);
    execute format('revoke all on table private.%I from public, anon, authenticated', table_name);
    execute format('grant all on table private.%I to service_role', table_name);
  end loop;
end $$;
grant usage on schema private to service_role;
revoke all on function private.assert_journal_entry_balanced() from public, anon, authenticated;
commit;