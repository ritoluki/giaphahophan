-- Synthetic-only TC-M03-06 test. Soft-delete hides the person and edges,
-- while facts/sources remain referenced for separate retention/erasure workflows.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm03-delete-a@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm03-delete-b@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'm03-delete-test', 'Synthetic M03 Delete Test', 'demo');

insert into private.branches (id, tree_id, created_by, code, name)
values ('51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'DELETE', 'Synthetic Delete Branch');

insert into private.persons (
  id, tree_id, created_by, code, display_name, name_search, life_status, visibility
) values
  ('31000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M03-DELETE-TARGET', 'Synthetic Delete Target', 'synthetic delete target', 'deceased', 'public'),
  ('31000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M03-DELETE-CHILD', 'Synthetic Delete Child', 'synthetic delete child', 'deceased', 'public');

insert into private.sources (id, tree_id, created_by, title, kind, provenance)
values ('41000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Synthetic Delete Source', 'oral', 'Synthetic local test only');

insert into private.parent_links (
  id, tree_id, created_by, parent_id, child_id, kind, status, source_id
) values (
  '71000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  'biological',
  'confirmed',
  '41000000-0000-4000-8000-000000000001'
);

insert into private.person_facts (
  id, tree_id, created_by, person_id, kind, value_text, visibility
) values (
  '61000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'occupation',
  'Synthetic occupation fact',
  'restricted'
);

insert into private.memberships (
  id, tree_id, created_by, auth_user_id, role, status
) values
  ('61000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'editor', 'active'),
  ('61000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'reviewer', 'active');

insert into private.capability_grants (
  id, tree_id, created_by, membership_id, capability
) values
  ('71000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', 'proposal.submit'),
  ('71000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', 'proposal.review');

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);

select person_id, version, edge_count, fact_count, source_count
from api.person_deletion_impact('31000000-0000-4000-8000-000000000001')
\gset impact_
select case
  when :'impact_person_id' = '31000000-0000-4000-8000-000000000001'
   and :'impact_version'::integer = 1
   and :'impact_edge_count'::integer = 1
   and :'impact_fact_count'::integer = 1
   and :'impact_source_count'::integer = 1
  then 1 else 1 / 0 end;

select id, version
from api.proposal_submit_idempotent(
  '11000000-0000-4000-8000-000000000001',
  'correction',
  'Synthetic soft-delete with impact preview',
  null,
  null,
  '[{"target_kind":"person","target_id":"31000000-0000-4000-8000-000000000001","base_version":1,"operation":"delete","field_changes":{},"source_ids":[]}]'::jsonb,
  '81000000-0000-4000-8000-000000000001',
  'synthetic-delete-submit-hash'
)
\gset delete_proposal_

select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000002', true);

select id, status, version
from api.proposal_review(
  :'delete_proposal_id'::uuid,
  'approve',
  'Synthetic independent soft-delete approval',
  :'delete_proposal_version'::bigint,
  'synthetic-delete-review-hash'
)
\gset delete_review_

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select count(*) as hidden_person_count
from api.person_get('31000000-0000-4000-8000-000000000001');
\gset hidden_person_
select case when :'hidden_person_hidden_person_count'::integer = 0 then 1 else 1 / 0 end;

select count(*) as hidden_name_count
from api.person_names_get('31000000-0000-4000-8000-000000000001');
\gset hidden_name_
select case when :'hidden_name_hidden_name_count'::integer = 0 then 1 else 1 / 0 end;

select count(*) as hidden_fact_count
from api.person_facts_get('31000000-0000-4000-8000-000000000001');
\gset hidden_fact_
select case when :'hidden_fact_hidden_fact_count'::integer = 0 then 1 else 1 / 0 end;

set local role postgres;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from private.persons
  where id = '31000000-0000-4000-8000-000000000001'
    and deleted_at is not null
    and version = 2;
  if v_count <> 1 then raise exception 'person was not soft-deleted with version increment'; end if;

  select count(*) into v_count
  from private.parent_links
  where id = '71000000-0000-4000-8000-000000000001'
    and deleted_at is not null;
  if v_count <> 1 then raise exception 'connected parent link was not soft-deleted'; end if;

  select count(*) into v_count
  from private.person_facts
  where id = '61000000-0000-4000-8000-000000000001';
  if v_count <> 1 then raise exception 'fact was erased instead of retained for separate erasure'; end if;

  select count(*) into v_count
  from private.sources
  where id = '41000000-0000-4000-8000-000000000001';
  if v_count <> 1 then raise exception 'source was erased instead of retained'; end if;

  select count(*) into v_count
  from private.audit_events
  where resource_id in ('31000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001')
    and action in ('person.soft_deleted', 'parent_link.soft_deleted');
  if v_count <> 2 then raise exception 'soft-delete audit events missing'; end if;
end;
$$;

rollback;
