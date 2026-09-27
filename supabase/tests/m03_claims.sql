-- Synthetic-only TC-M03-04 test. Claim never creates auth or capability.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
(
  '00000000-0000-0000-0000-000000000000',
  '25000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'm03-claim-requester@example.test',
  '',
  clock_timestamp(),
  clock_timestamp(),
  clock_timestamp(),
  '{}',
  '{}'
),
(
  '00000000-0000-0000-0000-000000000000',
  '25000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'm03-claim-reviewer@example.test',
  '',
  clock_timestamp(),
  clock_timestamp(),
  clock_timestamp(),
  '{}',
  '{}'
);

insert into private.trees (id, created_by, slug, name, data_mode)
values (
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  'm03-claims-test',
  'Synthetic M03 Claims Test',
  'demo'
);

insert into private.persons (
  id, tree_id, created_by, code, display_name, name_search, life_status, visibility
) values (
  '35000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  'M03-CLAIM-PERSON',
  'Synthetic Claimable Person',
  'synthetic claimable person',
  'deceased',
  'public'
);

insert into private.memberships (
  id, tree_id, created_by, auth_user_id, role, status
) values
(
  '65000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  'member',
  'active'
),
(
  '65000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000002',
  'reviewer',
  'active'
);

insert into private.capability_grants (
  id, tree_id, created_by, membership_id, capability
) values
(
  '75000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001',
  'proposal.submit'
),
(
  '75000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000002',
  'proposal.review'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-000000000001', true);

select *
from api.person_claim_submit_idempotent(
  '15000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000001',
  'Synthetic account claim',
  '85000000-0000-4000-8000-000000000001',
  'm03-claim-submit-hash'
)
\gset submit_

select case when :'submit_status' = 'pending' and :'submit_version'::integer = 1 then 1 else 1 / 0 end;

select *
from api.person_claim_submit_idempotent(
  '15000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000001',
  'Synthetic account claim',
  '85000000-0000-4000-8000-000000000001',
  'm03-claim-submit-hash'
)
\gset submit_replay_

select case when :'submit_replay_id' = :'submit_id' and :'submit_replay_version' = :'submit_version' then 1 else 1 / 0 end;

select set_config('test.claim_id', :'submit_id', true);

do $$
begin
  begin
    perform api.person_claim_review_idempotent(
      current_setting('test.claim_id')::uuid,
      'approve',
      'Requester must not self-review',
      1,
      '85000000-0000-4000-8000-000000000002',
      'm03-claim-self-review'
    );
    raise exception 'claim requester could self-review';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000002","aal":"aal2"}', true);

select *
from api.person_claim_review_idempotent(
  :'submit_id'::uuid,
  'approve',
  'Synthetic independent approval',
  1,
  '85000000-0000-4000-8000-000000000003',
  'm03-claim-review-hash'
)
\gset review_

select case when :'review_status' = 'approved' and :'review_version'::integer = 2 then 1 else 1 / 0 end;

select *
from api.person_claim_review_idempotent(
  :'submit_id'::uuid,
  'approve',
  'Synthetic independent approval',
  1,
  '85000000-0000-4000-8000-000000000003',
  'm03-claim-review-hash'
)
\gset review_replay_

select case when :'review_replay_id' = :'review_id' and :'review_replay_version' = :'review_version' then 1 else 1 / 0 end;

reset role;

select exists (
  select 1 from private.memberships
  where id = '65000000-0000-4000-8000-000000000001'
    and person_id = '35000000-0000-4000-8000-000000000001'::uuid
) as claim_linked \gset m03_link_
select case when :'m03_link_claim_linked' = 't' then 1 else 1 / 0 end;

select count(*) as capability_count
from private.capability_grants
where tree_id = '15000000-0000-4000-8000-000000000001'
\gset m03_capability_
select case when :'m03_capability_capability_count' = '2' then 1 else 1 / 0 end;

select count(*) as audit_count
from private.audit_events
where resource_kind = 'person_claim'
\gset m03_audit_
select case when :'m03_audit_audit_count' = '2' then 1 else 1 / 0 end;

select count(*) as outbox_count
from private.outbox
where event_type like 'person_claim.%'
\gset m03_outbox_
select case when :'m03_outbox_outbox_count' = '2' then 1 else 1 / 0 end;

rollback;
