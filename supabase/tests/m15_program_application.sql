-- Synthetic-only M15-01 test. Transaction is rolled back; no real people or evidence.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'b9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm15-manager@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'b9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm15-applicant@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'b9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'm15-reviewer@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'm15-scholarship-test', 'Synthetic M15 Scholarship Test', 'demo');

insert into private.persons (id, tree_id, created_by, code, display_name, name_search, life_status, visibility, protected_minor, confidence)
values
  ('b9200000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'M15-APPLICANT', 'Người học minh họa', 'nguoi hoc minh hoa', 'living', 'restricted', false, 'supported');

insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status, person_id, approved_by)
values
  ('b9300000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'owner', 'active', null, 'b9000000-0000-4000-8000-000000000001'),
  ('b9300000-0000-4000-8000-000000000002', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'member', 'active', 'b9200000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001'),
  ('b9300000-0000-4000-8000-000000000003', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000003', 'reviewer', 'active', null, 'b9000000-0000-4000-8000-000000000001');

insert into private.capability_grants (id, tree_id, created_by, membership_id, capability)
values ('b9400000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'b9300000-0000-4000-8000-000000000003', 'scholarship.review');

insert into private.capability_grants (id, tree_id, created_by, membership_id, capability)
values ('b9400000-0000-4000-8000-000000000002', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'b9300000-0000-4000-8000-000000000003', 'treasury.approve');
insert into private.funds (id, tree_id, created_by, name, visibility)
values ('b9500000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'Quỹ khuyến học minh họa', 'members');

insert into private.fund_accounts (id, tree_id, created_by, fund_id, code, kind, name)
values
  ('b9510000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'b9500000-0000-4000-8000-000000000001', 'CASH', 'asset', 'Tiền mặt minh họa'),
  ('b9510000-0000-4000-8000-000000000002', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'b9500000-0000-4000-8000-000000000001', 'SCHOLARSHIP_EXPENSE', 'expense', 'Chi khuyến học minh họa');
insert into private.media_assets (id, tree_id, created_by, filename, declared_mime, mime_type, size_bytes, actual_size_bytes, expected_sha256, actual_sha256, purpose, visibility, state, object_path, alt_text)
values ('b9600000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'synthetic-scholarship.pdf', 'application/pdf', 'application/pdf', 100, 100, repeat('b', 64), repeat('b', 64), 'scholarship', 'restricted', 'ready', 'synthetic/m15/scholarship.pdf', 'Tài liệu minh họa');

set local role service_role;
insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by)
values ('b9700000-0000-4000-8000-000000000010', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'M15-AWARD-001', '2026-09-28', 'Chi học bổng minh họa', 'draft', 'b9000000-0000-4000-8000-000000000002');
insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
values
  ('b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000010', 'b9510000-0000-4000-8000-000000000002', 300000),
  ('b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000010', 'b9510000-0000-4000-8000-000000000001', -300000);
update private.journal_entries set status='posted', approved_by='b9000000-0000-4000-8000-000000000003', posted_at=clock_timestamp() where id='b9700000-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000001","aal":"aal2"}', true);

select * from api.scholarship_program_create(
  'b9100000-0000-4000-8000-000000000001', 'b9500000-0000-4000-8000-000000000001',
  'Học bổng hiếu học minh họa', 'Thành tích học tập và tinh thần đóng góp cho gia đình.',
  clock_timestamp() + interval '30 days', 'open',
  'b9700000-0000-4000-8000-000000000001', 'm15-program-v1'
) \gset program_

select * from api.scholarship_program_create(
  'b9100000-0000-4000-8000-000000000001', 'b9500000-0000-4000-8000-000000000001',
  'Chương trình bản nháp minh họa', 'Nội dung chỉ dành cho người quản trị.', null, 'draft',
  'b9700000-0000-4000-8000-000000000002', 'm15-draft-v1'
) \gset draft_

select case when :'program_status' = 'open' and :'program_version' = '1' then 1 else 1 / 0 end;

select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000002","aal":"aal1"}', true);

select * from api.scholarship_application_create(
  :'program_id', 'b9200000-0000-4000-8000-000000000001', 'Em xin ứng tuyển chương trình minh họa.',
  'b9600000-0000-4000-8000-000000000001', 'b9800000-0000-4000-8000-000000000001', 'm15-application-v1'
) \gset application_
select * from api.scholarship_application_create(
  :'program_id', 'b9200000-0000-4000-8000-000000000001', 'Em xin ứng tuyển chương trình minh họa.',
  'b9600000-0000-4000-8000-000000000001', 'b9800000-0000-4000-8000-000000000001', 'm15-application-v1'
) \gset replay_
select case when :'application_id' = :'replay_id' and :'application_status' = 'submitted' then 1 else 1 / 0 end;

select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000002","aal":"aal1"}', true);
select * from api.scholarship_program_list('b9100000-0000-4000-8000-000000000001') \gset member_programs_
select case when :'member_programs_status' = 'open' and :'member_programs_id' = :'program_id' then 1 else 1 / 0 end;

select * from api.scholarship_application_list(:'program_id'::uuid) \gset member_application_
select case when :'member_application_id' = :'application_id' and :'member_application_status' = 'submitted' then 1 else 1 / 0 end;

select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000003","aal":"aal2"}', true);
select * from api.scholarship_application_list(:'program_id'::uuid) \gset reviewer_list_
select case when :'reviewer_list_id' = :'application_id' and :'reviewer_list_status' = 'submitted' then 1 else 1 / 0 end;
select * from api.scholarship_application_review(:'application_id'::uuid, 'needs_info', 'Bổ sung minh chứng minh họa.', 1, 'snapshot-v1', 'b9800000-0000-4000-8000-000000000002', 'm15-review-v1') \gset needs_info_
select case when :'needs_info_status' = 'needs_info' and :'needs_info_version' = '2' then 1 else 1 / 0 end;
select * from api.scholarship_application_review(:'application_id'::uuid, 'needs_info', 'Bổ sung minh chứng minh họa.', 1, 'snapshot-v1', 'b9800000-0000-4000-8000-000000000002', 'm15-review-v1') \gset needs_info_replay_
select case when :'needs_info_replay_status' = 'needs_info' and :'needs_info_replay_version' = '2' then 1 else 1 / 0 end;
select * from api.scholarship_application_review(:'application_id'::uuid, 'approve', 'Đủ điều kiện minh họa.', 2, 'snapshot-v2', 'b9800000-0000-4000-8000-000000000003', 'm15-review-v2') \gset approved_
select case when :'approved_status' = 'approved' and :'approved_version' = '3' then 1 else 1 / 0 end;
select set_config('m15.application_id', :'application_id', true);
do $$
begin
  begin
    perform * from api.scholarship_publication_create(current_setting('m15.application_id')::uuid, 'Câu chuyện chưa đủ điều kiện', 'Nội dung chưa được guardian xác nhận.', 'b9600000-0000-4000-8000-000000000001', 'b9900000-0000-4000-8000-000000000001', 'm15-publication-guard');
    raise exception 'minor publication without guardian safeguard was accepted';
  exception when insufficient_privilege or raise_exception then
    if sqlerrm = 'minor publication without guardian safeguard was accepted' then raise; end if;
  end;
end $$;
select * from api.scholarship_application_safeguard_set(:'application_id'::uuid, 'minor', 'verified', 'b9600000-0000-4000-8000-000000000001', 'Đã kiểm tra quy trình người đại diện trong fixture.', 3, 'b9900000-0000-4000-8000-000000000002', 'm15-safeguard-v1') \gset safeguard_
select case when :'safeguard_minor_status' = 'minor' and :'safeguard_guardian_status' = 'verified' and :'safeguard_version' = '4' then 1 else 1 / 0 end;
select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000002","aal":"aal1"}', true);
select * from api.scholarship_publication_create(:'application_id'::uuid, 'Câu chuyện học tập minh họa', 'Nội dung được đề cử để reviewer kiểm tra riêng.', 'b9600000-0000-4000-8000-000000000001', 'b9900000-0000-4000-8000-000000000003', 'm15-publication-v1') \gset publication_
select * from api.scholarship_publication_create(:'application_id'::uuid, 'Câu chuyện học tập minh họa', 'Nội dung được đề cử để reviewer kiểm tra riêng.', 'b9600000-0000-4000-8000-000000000001', 'b9900000-0000-4000-8000-000000000003', 'm15-publication-v1') \gset publication_replay_
select case when :'publication_status' = 'submitted' and :'publication_id' = :'publication_replay_id' then 1 else 1 / 0 end;
select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000003","aal":"aal2"}', true);
select * from api.scholarship_publication_review(:'publication_id'::uuid, 'approve', 'Đã duyệt story độc lập với award.', 1, 'publication-snapshot-v1', 'b9900000-0000-4000-8000-000000000004', 'm15-publication-review-v1') \gset publication_review_
select case when :'publication_review_status' = 'approved' and :'publication_review_version' = '2' then 1 else 1 / 0 end;
select * from api.scholarship_stories('b9100000-0000-4000-8000-000000000001') \gset story_
select case when :'story_id' = :'publication_id' and :'story_published_at' is not null then 1 else 1 / 0 end;
select to_jsonb(row('story'::text, :'story_title'::text, :'story_story'::text)) \gset story_json_
select case when :'story_json_to_jsonb' not like '%person_id%' and :'story_json_to_jsonb' not like '%source_asset_id%' then 1 else 1 / 0 end;
select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000001","aal":"aal2"}', true);
select * from api.scholarship_award_create(:'application_id'::uuid, 300000, 'Hỗ trợ khuyến học minh họa.', 'b9900000-0000-4000-8000-000000000005', 'm15-award-v1') \gset award_
select case when :'award_status' = 'approved' and :'award_version' = '1' then 1 else 1 / 0 end;
select set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"b9000000-0000-4000-8000-000000000003","aal":"aal2"}', true);
select * from api.scholarship_award_mark_paid(:'award_id'::uuid, 'b9700000-0000-4000-8000-000000000010', 1, 'b9900000-0000-4000-8000-000000000006', 'm15-award-paid-v1') \gset paid_
select case when :'paid_status' = 'paid' and :'paid_version' = '2' and :'paid_paid_journal_entry_id' = 'b9700000-0000-4000-8000-000000000010' then 1 else 1 / 0 end;
select * from api.scholarship_award_mark_paid(:'award_id'::uuid, 'b9700000-0000-4000-8000-000000000010', 1, 'b9900000-0000-4000-8000-000000000006', 'm15-award-paid-v1') \gset paid_replay_
select case when :'paid_replay_status' = 'paid' and :'paid_replay_version' = '2' and :'paid_replay_paid_journal_entry_id' = 'b9700000-0000-4000-8000-000000000010' then 1 else 1 / 0 end;
set local role service_role;
insert into private.journal_entries (id, tree_id, created_by, fund_id, code, entry_date, description, status, submitted_by, reverses_entry_id)
values ('b9700000-0000-4000-8000-000000000011', 'b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'M15-AWARD-REV-001', '2026-09-28', 'Đảo chi học bổng minh họa', 'draft', 'b9000000-0000-4000-8000-000000000002', 'b9700000-0000-4000-8000-000000000010');
insert into private.journal_lines (tree_id, created_by, fund_id, entry_id, account_id, signed_amount_vnd)
values
  ('b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000011', 'b9510000-0000-4000-8000-000000000002', -300000),
  ('b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'b9700000-0000-4000-8000-000000000011', 'b9510000-0000-4000-8000-000000000001', 300000);
update private.journal_entries set status='posted', approved_by='b9000000-0000-4000-8000-000000000003', posted_at=clock_timestamp() where id='b9700000-0000-4000-8000-000000000011';
reset role;
select * from private.scholarship_awards where id=:'award_id'::uuid \gset reversed_
select case when :'reversed_status' = 'reversed' and :'reversed_reversal_journal_entry_id' = 'b9700000-0000-4000-8000-000000000011' then 1 else 1 / 0 end;

set local role authenticated;
do $$
begin
  begin
    execute 'select count(*) from private.scholarship_applications';
    raise exception 'authenticated role read private scholarship applications';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;