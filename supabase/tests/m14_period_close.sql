-- Synthetic-only M14-05 period-close/reconciliation test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm14-close-member@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm14-close-reviewer@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'm14-close-test', 'Synthetic M14 Close Test', 'demo');

insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status, approved_by)
values
  ('a9200000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000001', 'member', 'active', 'a9000000-0000-4000-8000-000000000002'),
  ('a9200000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000002', 'reviewer', 'active', 'a9000000-0000-4000-8000-000000000002');

insert into private.capability_grants (id, tree_id, created_by, membership_id, capability)
values ('a9300000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9200000-0000-4000-8000-000000000002', 'treasury.approve');

insert into private.funds (id, tree_id, created_by, name, visibility)
values ('a9400000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'Synthetic close fund', 'members');

insert into private.fund_accounts (id, tree_id, created_by, fund_id, code, kind, name)
values
  ('a9500000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'CASH', 'asset', 'Cash'),
  ('a9500000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'INCOME', 'income', 'Income'),
  ('a9500000-0000-4000-8000-000000000003', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'EXPENSE', 'expense', 'Expense');

insert into private.media_assets (
  id, tree_id, created_by, filename, declared_mime, mime_type, size_bytes, actual_size_bytes,
  expected_sha256, actual_sha256, purpose, visibility, state, object_path
)
values (
  'a9600000-0000-4000-8000-000000000001',
  'a9100000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'synthetic-receipt.pdf', 'application/pdf', 'application/pdf', 100, 100,
  repeat('a', 64), repeat('a', 64), 'receipt', 'restricted', 'ready',
  'synthetic/m14-close-receipt.pdf'
);

insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by, approved_by, posted_at, proof_asset_id)
values
  ('a9700000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'M14-CLOSE-001', '2026-08-31', 'Opening', 'draft', 'a9000000-0000-4000-8000-000000000001', null, null, null),
  ('a9700000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'M14-CLOSE-002', '2026-09-10', 'Receipt', 'draft', 'a9000000-0000-4000-8000-000000000001', null, null, 'a9600000-0000-4000-8000-000000000001'),
  ('a9700000-0000-4000-8000-000000000003', 'a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'M14-CLOSE-003', '2026-09-15', 'Payment', 'draft', 'a9000000-0000-4000-8000-000000000001', null, null, null);

insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
values
  ('a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'a9700000-0000-4000-8000-000000000001', 'a9500000-0000-4000-8000-000000000001', 1000),
  ('a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'a9700000-0000-4000-8000-000000000001', 'a9500000-0000-4000-8000-000000000002', -1000),
  ('a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'a9700000-0000-4000-8000-000000000002', 'a9500000-0000-4000-8000-000000000001', 500),
  ('a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'a9700000-0000-4000-8000-000000000002', 'a9500000-0000-4000-8000-000000000002', -500),
  ('a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'a9700000-0000-4000-8000-000000000003', 'a9500000-0000-4000-8000-000000000001', -200),
  ('a9100000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001', 'a9700000-0000-4000-8000-000000000003', 'a9500000-0000-4000-8000-000000000003', 200);

update private.journal_entries
set status = 'posted', approved_by = 'a9000000-0000-4000-8000-000000000002', posted_at = clock_timestamp()
where tree_id = 'a9100000-0000-4000-8000-000000000001';

do $$
declare
  v_reconciliation record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
  perform set_config('request.jwt.claims', '{"sub":"a9000000-0000-4000-8000-000000000002","aal":"aal2"}', true);
  select * into v_reconciliation from api.fund_period_reconciliation('a9400000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30');
  if v_reconciliation.status <> 'open' or v_reconciliation.opening_vnd <> '1000' or v_reconciliation.income_vnd <> '500'
     or v_reconciliation.expense_vnd <> '200' or v_reconciliation.closing_vnd <> '1300'
     or v_reconciliation.posted_entries <> 2 or v_reconciliation.proof_ready <> 1
     or v_reconciliation.proof_missing <> 1 then
    raise exception 'open reconciliation projection is incorrect';
  end if;
end $$;

do $$
declare
  v_closed record;
  v_replay record;
begin
  select * into v_closed from api.fund_period_close(
    'a9400000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', 'Da doi chieu ky', 1,
    'a9800000-0000-4000-8000-000000000001', 'm14-close-request-v1'
  );
  if v_closed.status <> 'locked' or v_closed.version <> 2 or v_closed.closing_vnd <> '1300'
     or v_closed.proof_total <> 2 or v_closed.proof_ready <> 1 or v_closed.proof_missing <> 1 then
    raise exception 'period close snapshot is incorrect';
  end if;
  select * into v_replay from api.fund_period_close(
    'a9400000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', 'Da doi chieu ky', 1,
    'a9800000-0000-4000-8000-000000000001', 'm14-close-request-v1'
  );
  if v_replay.status <> 'locked' or v_replay.closing_vnd <> '1300' then
    raise exception 'period close idempotent replay failed';
  end if;
end $$;

do $$
declare
  v_public jsonb;
  v_locked record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"a9000000-0000-4000-8000-000000000001","aal":"aal1"}', true);
  select * into v_locked from api.fund_period_reconciliation('a9400000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30');
  select to_jsonb(v_locked) into v_public;
  if v_locked.status <> 'locked' or v_locked.closing_vnd <> '1300'
     or v_public ? 'donor_person_id' or v_public ? 'proof_asset_id' then
    raise exception 'member locked projection is incorrect or leaked private fields';
  end if;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"a9000000-0000-4000-8000-000000000001","aal":"aal1"}', true);
  begin
    perform * from api.fund_period_close(
      'a9400000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-31', 'Member close attempt', 2,
      'a9800000-0000-4000-8000-000000000002', 'member-close-request'
    );
    raise exception 'member period close was accepted';
  exception when insufficient_privilege then
    null;
  end;
end $$;

do $$
begin
  set local role service_role;
  perform set_config('request.jwt.claim.sub', 'a9000000-0000-4000-8000-000000000002', true);
  perform set_config('request.jwt.claims', '{"sub":"a9000000-0000-4000-8000-000000000002","aal":"aal2"}', true);
  begin
    insert into private.journal_entries (
      id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by
    ) values (
      'a9700000-0000-4000-8000-000000000004', 'a9100000-0000-4000-8000-000000000001',
      'a9000000-0000-4000-8000-000000000002', 'a9400000-0000-4000-8000-000000000001',
      'M14-CLOSE-004', '2026-09-20', 'Closed period attempt', 'draft',
      'a9000000-0000-4000-8000-000000000002'
    );
    raise exception 'closed period journal insert was accepted';
  exception when raise_exception then
    null;
  end;
end $$;

rollback;