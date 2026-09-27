-- Synthetic-only M14-01 test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'm14-author@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'm14-reviewer@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');
insert into private.trees (id, created_by, slug, name, data_mode)
values ('a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'm14-ledger-test', 'Synthetic M14 Ledger Test', 'demo');
insert into private.funds (id, tree_id, created_by, name, visibility)
values ('a5200000-0000-4000-0000-000000000001', 'a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'Quỹ minh họa', 'members');
insert into private.fund_accounts (id, tree_id, created_by, fund_id, code, kind, name)
values
  ('a5300000-0000-4000-0000-000000000001', 'a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'a5200000-0000-4000-0000-000000000001', 'CASH', 'asset', 'Tiền mặt'),
  ('a5300000-0000-4000-0000-000000000002', 'a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'a5200000-0000-4000-0000-000000000001', 'DONATION', 'income', 'Đóng góp');

insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by, approved_by)
values ('a5400000-0000-4000-0000-000000000001', 'a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'a5200000-0000-4000-0000-000000000001', 'M14-DEMO-001', '2026-09-28', 'Thu quỹ minh họa', 'posted', 'a5000000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000002');
insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
values
  ('a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000002', 'a5200000-0000-4000-0000-000000000001', 'a5400000-0000-4000-0000-000000000001', 'a5300000-0000-4000-0000-000000000001', 150000),
  ('a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000002', 'a5200000-0000-4000-0000-000000000001', 'a5400000-0000-4000-0000-000000000001', 'a5300000-0000-4000-0000-000000000002', -150000);

do $$
begin
  if not exists (select 1 from private.journal_lines where entry_id = 'a5400000-0000-4000-0000-000000000001' group by entry_id having count(*) = 2 and sum(signed_amount_vnd) = 0) then
    raise exception 'balanced posted journal was not persisted';
  end if;
end $$;

do $$
begin
  begin
    insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by)
    values ('a5400000-0000-4000-0000-000000000002', 'a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'a5200000-0000-4000-0000-000000000001', 'M14-DEMO-002', '2026-09-28', 'Unbalanced fixture', 'posted', 'a5000000-0000-4000-0000-000000000001');
    insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
    values ('a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'a5200000-0000-4000-0000-000000000001', 'a5400000-0000-4000-0000-000000000002', 'a5300000-0000-4000-0000-000000000001', 1);
    set constraints all immediate;
    raise exception 'unbalanced posted journal was accepted';
  exception when check_violation then
    null;
  end;
end $$;
set constraints all deferred;

do $$
begin
  begin
    insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
    values ('a5100000-0000-4000-0000-000000000001', 'a5000000-0000-4000-0000-000000000001', 'a5200000-0000-4000-0000-000000000001', 'a5400000-0000-4000-0000-000000000001', 'a5300000-0000-4000-0000-000000000001', 0);
    raise exception 'zero journal line was accepted';
  exception when check_violation then
    null;
  end;
end $$;

set local role authenticated;
do $$
begin
  begin
    execute 'select count(*) from private.funds';
    raise exception 'authenticated role read private funds';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;