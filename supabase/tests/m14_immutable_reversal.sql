-- Synthetic-only M14-03 test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'm14-reversal-author@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'm14-reversal-reviewer@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');
insert into private.trees (id, created_by, slug, name, data_mode)
values ('a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'm14-reversal-test', 'Synthetic M14 Reversal Test', 'demo');
insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status, approved_by)
values
  ('a7200000-0000-4000-0000-000000000001', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'member', 'active', 'a7000000-0000-4000-0000-000000000002'),
  ('a7200000-0000-4000-0000-000000000002', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000002', 'member', 'active', 'a7000000-0000-4000-0000-000000000001');
insert into private.capability_grants (id, tree_id, created_by, membership_id, capability)
values
  ('a7300000-0000-4000-0000-000000000001', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7200000-0000-4000-0000-000000000001', 'treasury.write'),
  ('a7300000-0000-4000-0000-000000000002', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7200000-0000-4000-0000-000000000002', 'treasury.approve');
insert into private.funds (id, tree_id, created_by, name, visibility)
values ('a7400000-0000-4000-0000-000000000001', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'Synthetic reversal fund', 'members');
insert into private.fund_accounts (id, tree_id, created_by, fund_id, code, kind, name)
values
  ('a7500000-0000-4000-0000-000000000001', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7400000-0000-4000-0000-000000000001', 'CASH', 'asset', 'Cash'),
  ('a7500000-0000-4000-0000-000000000002', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7400000-0000-4000-0000-000000000001', 'INCOME', 'income', 'Income');

insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by, approved_by, posted_at, version)
values ('a7600000-0000-4000-0000-000000000001', 'a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7400000-0000-4000-0000-000000000001', 'M14-REV-001', '2026-09-28', 'Synthetic posted source', 'draft', 'a7000000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000002', clock_timestamp(), 3);
insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
values
  ('a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7400000-0000-4000-0000-000000000001', 'a7600000-0000-4000-0000-000000000001', 'a7500000-0000-4000-0000-000000000001', 100000),
  ('a7100000-0000-4000-0000-000000000001', 'a7000000-0000-4000-0000-000000000001', 'a7400000-0000-4000-0000-000000000001', 'a7600000-0000-4000-0000-000000000001', 'a7500000-0000-4000-0000-000000000002', -100000);
update private.journal_entries
set status = 'posted', posted_at = clock_timestamp()
where id = 'a7600000-0000-4000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-0000-000000000001","aal":"aal1"}', true);
select * from api.journal_entry_reverse_idempotent('a7600000-0000-4000-0000-000000000001', 3, 'Synthetic correction', 'a7700000-0000-4000-0000-000000000001', 'reverse-hash') \gset reverse_
select case when :'reverse_status' = 'draft' and :'reverse_version' = '1' then 1 else 1/0 end as reverse_created_assertion;

select :'reverse_id' as reversal_id \gset reverse_id_
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-0000-000000000001","aal":"aal1"}', true);
select * from api.journal_entry_submit_idempotent(:'reverse_id', 1, 'Submit linked reversal', 'a7700000-0000-4000-0000-000000000002', 'reverse-submit-hash') \gset reverse_submit_
select case when :'reverse_submit_status' = 'submitted' and :'reverse_submit_version' = '2' then 1 else 1/0 end as reverse_submit_assertion;

select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-0000-000000000002","aal":"aal2"}', true);
select * from api.journal_entry_approve_idempotent(:'reverse_id', 2, 'Approve linked reversal', 'a7700000-0000-4000-0000-000000000003', 'reverse-approve-hash') \gset reverse_approve_
select case when :'reverse_approve_status' = 'posted' and :'reverse_approve_version' = '3' then 1 else 1/0 end as reverse_approve_assertion;

-- Replaying the same reverse command returns the draft projection and does not create a second linked reversal.
select set_config('request.jwt.claim.sub', 'a7000000-0000-4000-0000-000000000001', true);
select * from api.journal_entry_reverse_idempotent('a7600000-0000-4000-0000-000000000001', 3, 'Synthetic correction', 'a7700000-0000-4000-0000-000000000001', 'reverse-hash') \gset reverse_replay_
select case when :'reverse_replay_status' = 'draft' and :'reverse_replay_version' = '1' then 1 else 1/0 end as reverse_replay_assertion;

do $$
begin
  begin
    perform * from api.journal_entry_reverse_idempotent('a7600000-0000-4000-0000-000000000001', 3, 'Second correction', 'a7700000-0000-4000-0000-000000000004', 'second-reverse');
    raise exception 'duplicate reversal was created';
  exception when unique_violation then
    null;
  end;
end $$;

set local role service_role;
do $$
declare
  v_reversal_id uuid;
begin
  select id into v_reversal_id
  from private.journal_entries
  where reverses_entry_id = 'a7600000-0000-4000-0000-000000000001';
  if (select status from private.journal_entries where id = 'a7600000-0000-4000-0000-000000000001') <> 'posted'
     or (select version from private.journal_entries where id = 'a7600000-0000-4000-0000-000000000001') <> 3
     or (select count(*) from private.journal_entries where reverses_entry_id = 'a7600000-0000-4000-0000-000000000001') <> 1
     or (select status from private.journal_entries where id = v_reversal_id) <> 'posted'
     or (select count(*) from private.journal_lines where entry_id = v_reversal_id and signed_amount_vnd in (100000, -100000)) <> 2 then
    raise exception 'reversal linkage or immutable source assertion failed';
  end if;
end $$;

do $$
begin
  begin
    update private.journal_entries set description = 'tampered' where id = 'a7600000-0000-4000-0000-000000000001';
    raise exception 'posted journal entry was mutable';
  exception when insufficient_privilege then
    null;
  end;
  begin
    delete from private.journal_lines where entry_id = 'a7600000-0000-4000-0000-000000000001';
    raise exception 'posted journal lines were mutable';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;