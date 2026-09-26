-- Synthetic-only CORE-01 authorization test.
-- The transaction is rolled back; no test identity or genealogy data persists.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'core-a@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'core-b@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'core-authorization-test', 'Synthetic Core Authorization Test', 'demo');

insert into private.branches (id, tree_id, created_by, code, name)
values ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CORE', 'Synthetic Core Branch');

insert into private.persons (id, tree_id, created_by, code, display_name, name_search, visibility, protected_minor)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CORE-PUBLIC', 'Synthetic Public Person', 'synthetic public person', 'public', false),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CORE-PROTECTED', 'Synthetic Protected Person', 'synthetic protected person', 'public', true);

insert into private.sources (id, tree_id, created_by, title, kind, provenance)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Synthetic source', 'oral', 'Synthetic test fixture only');

insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status)
values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'editor', 'active'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'reviewer', 'active');

insert into private.capability_grants (id, tree_id, created_by, membership_id, capability)
values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'proposal.submit'),
  ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'proposal.review');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from api.person_get('30000000-0000-4000-8000-000000000001');
  if v_count <> 1 then raise exception 'anonymous public projection expected 1 row, got %', v_count; end if;
  select count(*) into v_count from api.person_get('30000000-0000-4000-8000-000000000002');
  if v_count <> 0 then raise exception 'anonymous protected projection expected 0 rows, got %', v_count; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select id, version
from api.proposal_submit(
  '10000000-0000-4000-8000-000000000001',
  'correction',
  'Synthetic correction proposal',
  '50000000-0000-4000-8000-000000000001',
  '{"graphRevision":1}'::jsonb,
  '[{"target_kind":"person","target_id":"30000000-0000-4000-8000-000000000001","base_version":1,"operation":"update","field_changes":{"display_name":"Synthetic Updated Person"},"source_ids":["40000000-0000-4000-8000-000000000001"]}]'::jsonb
)
\gset submitted_

select set_config('test.submitted_id', :'submitted_id', true);
select set_config('test.submitted_version', :'submitted_version', true);

do $$
declare
  v_proposal_id uuid := current_setting('test.submitted_id')::uuid;
  v_version bigint := current_setting('test.submitted_version')::bigint;
begin
  begin
    perform api.proposal_review(
      v_proposal_id, 'approve', 'Author review must fail', v_version, 'synthetic-hash'
    );
    raise exception 'proposal author was allowed to review own proposal';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select id, status, version
from api.proposal_review(
  :'submitted_id'::uuid, 'approve', 'Synthetic independent review', :'submitted_version'::bigint, 'synthetic-hash'
)
\gset reviewed_

set local role postgres;

do $$
declare
  v_count integer;
  v_proposal_id uuid := current_setting('test.submitted_id')::uuid;
begin
  select count(*) into v_count from private.audit_events where resource_id = v_proposal_id;
  if v_count <> 2 then raise exception 'expected submit+review audit rows, got %', v_count; end if;
  select count(*) into v_count from private.outbox where resource_id = v_proposal_id;
  if v_count <> 2 then raise exception 'expected submit+review outbox rows, got %', v_count; end if;
end;
$$;

rollback;
