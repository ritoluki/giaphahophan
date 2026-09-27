-- Synthetic-only M14-04 report/privacy test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'm14-report-member@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'm14-report-reviewer@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');
insert into private.trees (id, created_by, slug, name, data_mode)
values ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'm14-report-test', 'Synthetic M14 Report Test', 'demo');
insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status, approved_by)
values ('a8200000-0000-4000-0000-000000000001', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'member', 'active', 'a8000000-0000-4000-0000-000000000001');
insert into private.funds (id, tree_id, created_by, name, visibility)
values
  ('a8300000-0000-4000-0000-000000000001', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'Synthetic member fund', 'members'),
  ('a8300000-0000-4000-0000-000000000002', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'Synthetic restricted fund', 'restricted');
insert into private.fund_accounts (id, tree_id, created_by, fund_id, code, kind, name)
values
  ('a8400000-0000-4000-0000-000000000001', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'CASH', 'asset', 'Cash'),
  ('a8400000-0000-4000-0000-000000000002', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'INCOME', 'income', 'Income'),
  ('a8400000-0000-4000-0000-000000000003', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'EXPENSE', 'expense', 'Expense');

insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by, approved_by, posted_at)
values
  ('a8500000-0000-4000-0000-000000000001', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'M14-REPORT-001', '2026-08-31', 'Opening', 'draft', 'a8000000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000002', clock_timestamp()),
  ('a8500000-0000-4000-0000-000000000002', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'M14-REPORT-002', '2026-09-10', 'Receipt', 'draft', 'a8000000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000002', clock_timestamp()),
  ('a8500000-0000-4000-0000-000000000003', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'M14-REPORT-003', '2026-09-15', 'Payment', 'draft', 'a8000000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000002', clock_timestamp()),
  ('a8500000-0000-4000-0000-000000000004', 'a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'M14-REPORT-004', '2026-10-01', 'Future', 'draft', 'a8000000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000002', clock_timestamp());

insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
values
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000001', 'a8400000-0000-4000-0000-000000000001', 1000),
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000001', 'a8400000-0000-4000-0000-000000000002', -1000),
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000002', 'a8400000-0000-4000-0000-000000000001', 500),
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000002', 'a8400000-0000-4000-0000-000000000002', -500),
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000003', 'a8400000-0000-4000-0000-000000000001', -200),
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000003', 'a8400000-0000-4000-0000-000000000003', 200),
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000004', 'a8400000-0000-4000-0000-000000000001', 700),
  ('a8100000-0000-4000-0000-000000000001', 'a8000000-0000-4000-0000-000000000001', 'a8300000-0000-4000-0000-000000000001', 'a8500000-0000-4000-0000-000000000004', 'a8400000-0000-4000-0000-000000000002', -700);

update private.journal_entries set status = 'posted' where tree_id = 'a8100000-0000-4000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a8000000-0000-4000-0000-000000000001","aal":"aal1"}', true);

do $$
declare
  v_report record;
  v_public jsonb;
begin
  select * into v_report from api.fund_report('a8300000-0000-4000-0000-000000000001', '2026-09-01', '2026-09-30');
  if v_report.opening_vnd <> '1000' or v_report.income_vnd <> '500' or v_report.expense_vnd <> '200' or v_report.closing_vnd <> '1300' then
    raise exception 'fund report totals are incorrect';
  end if;
  select to_jsonb(v_report) into v_public;
  if v_public ? 'donor_person_id' or v_public ? 'proof_asset_id' then
    raise exception 'fund report leaked private fields';
  end if;
end $$;

do $$
begin
  begin
    perform * from api.fund_report('a8300000-0000-4000-0000-000000000002', '2026-09-01', '2026-09-30');
    raise exception 'restricted fund report was visible to member without treasury grant';
  exception when insufficient_privilege then
    null;
  end;
end $$;

do $$
begin
  begin
    perform * from api.fund_report('a8300000-0000-4000-0000-000000000001', '2026-10-01', '2026-09-01');
    raise exception 'invalid report range was accepted';
  exception when invalid_parameter_value then
    null;
  end;
end $$;

do $$
begin
  begin
    execute 'select count(*) from private.journal_entries';
    raise exception 'authenticated role read private journal entries';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;