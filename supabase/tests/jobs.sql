-- Synthetic-only JOBS-01 test. The transaction is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '22000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'jobs-a@example.test',
  '',
  clock_timestamp(),
  clock_timestamp(),
  clock_timestamp(),
  '{}',
  '{}'
);

insert into private.trees (id, created_by, slug, name, data_mode)
values (
  '12000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'jobs-outbox-test',
  'Synthetic Jobs Outbox Test',
  'demo'
);

insert into private.outbox (
  id, tree_id, event_type, resource_id, resource_version, dedupe_key, requested_by
) values (
  '82000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'person.updated',
  '32000000-0000-4000-8000-000000000001',
  2,
  'jobs.synthetic.person.updated.1',
  '22000000-0000-4000-8000-000000000001'
);

set local role authenticated;

do $$
begin
  begin
    perform jobs.outbox_claim('92000000-0000-4000-8000-000000000001', 10, 60);
    raise exception 'authenticated role could claim outbox work';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

set local role service_role;

select id, attempts
from jobs.outbox_claim(
  '92000000-0000-4000-8000-000000000001',
  100,
  60
)
where id = '82000000-0000-4000-8000-000000000001'
\gset first_claim_

select set_config('test.outbox_id', '82000000-0000-4000-8000-000000000001', true);

select case when :'first_claim_attempts'::integer = 1 then 1 else 1 / 0 end;

select jobs.outbox_mark_failed(
  current_setting('test.outbox_id')::uuid,
  '92000000-0000-4000-8000-000000000001',
  'TEMP_FAILURE',
  0
);

select id, attempts
from jobs.outbox_claim(
  '93000000-0000-4000-8000-000000000001',
  100,
  60
)
where id = '82000000-0000-4000-8000-000000000001'
\gset retry_claim_

select case when :'retry_claim_attempts'::integer = 2 then 1 else 1 / 0 end;

select jobs.outbox_mark_published(
  current_setting('test.outbox_id')::uuid,
  '93000000-0000-4000-8000-000000000001'
) as published_ok \gset publish_

select case when :'publish_published_ok' = 't' then 1 else 1 / 0 end;

select jobs.outbox_mark_published(
  current_setting('test.outbox_id')::uuid,
  '93000000-0000-4000-8000-000000000001'
) as published_again \gset published_again_

select case when :'published_again_published_again' = 'f' then 1 else 1 / 0 end;

rollback;
