-- Synthetic-only M14-02 test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'm14-two-author@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'm14-two-reviewer@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');
insert into private.trees (id, created_by, slug, name, data_mode)
values ('a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'm14-two-person-test', 'Synthetic M14 Two Person Test', 'demo');
insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status, approved_by)
values
  ('a6200000-0000-4000-0000-000000000001', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'member', 'active', 'a6000000-0000-4000-0000-000000000002'),
  ('a6200000-0000-4000-0000-000000000002', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000002', 'member', 'active', 'a6000000-0000-4000-0000-000000000001');
insert into private.capability_grants (id, tree_id, created_by, membership_id, capability)
values
  ('a6300000-0000-4000-0000-000000000001', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6200000-0000-4000-0000-000000000001', 'treasury.write'),
  ('a6300000-0000-4000-0000-000000000002', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6200000-0000-4000-0000-000000000002', 'treasury.approve');
insert into private.funds (id, tree_id, created_by, name, visibility)
values ('a6400000-0000-4000-0000-000000000001', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'Quỹ hai người minh họa', 'members');
insert into private.fund_accounts (id, tree_id, created_by, fund_id, code, kind, name)
values
  ('a6500000-0000-4000-0000-000000000001', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6400000-0000-4000-0000-000000000001', 'CASH', 'asset', 'Tiền mặt'),
  ('a6500000-0000-4000-0000-000000000002', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6400000-0000-4000-0000-000000000001', 'INCOME', 'income', 'Thu quỹ');
insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by)
values ('a6600000-0000-4000-0000-000000000001', 'a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6400000-0000-4000-0000-000000000001', 'M14-TWO-001', '2026-09-28', 'Phiếu hai người minh họa', 'draft', 'a6000000-0000-4000-0000-000000000001');
insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
values
  ('a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6400000-0000-4000-0000-000000000001', 'a6600000-0000-4000-0000-000000000001', 'a6500000-0000-4000-0000-000000000001', 100000),
  ('a6100000-0000-4000-0000-000000000001', 'a6000000-0000-4000-0000-000000000001', 'a6400000-0000-4000-0000-000000000001', 'a6600000-0000-4000-0000-000000000001', 'a6500000-0000-4000-0000-000000000002', -100000);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-0000-000000000001","aal":"aal1"}', true);
select * from api.journal_entry_submit_idempotent('a6600000-0000-4000-0000-000000000001', 1, 'Synthetic submit', 'a6700000-0000-4000-0000-000000000001', 'submit-hash') \gset submit_
select case when :'submit_status' = 'submitted' and :'submit_version' = '2' then 1 else 1/0 end as submit_assertion;

-- Author cannot approve, even with aal2.
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-0000-000000000001","aal":"aal2"}', true);
do $$
begin
  begin
    perform * from api.journal_entry_approve_idempotent('a6600000-0000-4000-0000-000000000001', 2, 'Self approve', 'a6700000-0000-4000-0000-000000000002', 'self-approve');
    raise exception 'author self-approved journal';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Reviewer grant without MFA is denied.
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-0000-000000000002","aal":"aal1"}', true);
do $$
begin
  begin
    perform * from api.journal_entry_approve_idempotent('a6600000-0000-4000-0000-000000000001', 2, 'No MFA', 'a6700000-0000-4000-0000-000000000003', 'no-mfa');
    raise exception 'reviewer approved without MFA';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-0000-000000000002","aal":"aal2"}', true);
select * from api.journal_entry_approve_idempotent('a6600000-0000-4000-0000-000000000001', 2, 'Independent MFA review', 'a6700000-0000-4000-0000-000000000004', 'approve-hash') \gset approve_
select case when :'approve_status' = 'posted' and :'approve_version' = '3' then 1 else 1/0 end as approve_assertion;

-- Same idempotency key/body replays without a second post.
select * from api.journal_entry_approve_idempotent('a6600000-0000-4000-0000-000000000001', 2, 'Independent MFA review', 'a6700000-0000-4000-0000-000000000004', 'approve-hash') \gset replay_
select case when :'replay_status' = 'posted' and :'replay_version' = '3' then 1 else 1/0 end as replay_assertion;

set local role authenticated;
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