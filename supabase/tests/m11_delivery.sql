-- Synthetic-only M11-02 test. The transaction is rolled back.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '27000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm11-delivery@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');
insert into private.trees (id, created_by, slug, name, data_mode) values ('17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'm11-delivery-test', 'Synthetic M11 Delivery Test', 'demo');
insert into private.memberships (id, tree_id, auth_user_id, role, status) values ('37000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'member', 'active');
insert into private.notifications (id, tree_id, created_by, membership_id, kind, resource_kind, resource_id, dedupe_key)
values ('47000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', 'event.reminder', 'event', '57000000-0000-4000-8000-000000000001', 'event:occurrence:member:email:7');
insert into private.delivery_attempts (id, tree_id, created_by, notification_id, channel, status, idempotency_key)
values ('67000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000001', 'email', 'queued', 'event:occurrence:member:email:7');

set local role authenticated;
do $$ begin
  begin
    perform 1 from private.delivery_attempts;
    raise exception 'authenticated role could read delivery state';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role service_role;
update private.delivery_attempts
set status = 'accepted', provider_message_id = 'provider-synthetic-1', attempt_count = attempt_count + 1
where id = '67000000-0000-4000-8000-000000000001' and idempotency_key = 'event:occurrence:member:email:7';
select case when status = 'accepted' and provider_message_id = 'provider-synthetic-1' and attempt_count = 1 then 1 else 0 end as delivery_state_ok
from private.delivery_attempts where id = '67000000-0000-4000-8000-000000000001' \gset delivery_
select case when :'delivery_delivery_state_ok' = '1' then 1 else 1 / 0 end;

do $$ begin
  begin
    insert into private.delivery_attempts (tree_id, notification_id, channel, status, idempotency_key)
    values ('17000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000001', 'email', 'queued', 'event:occurrence:member:email:7');
    raise exception 'duplicate provider idempotency key was accepted';
  exception when unique_violation then null;
  end;
end $$;

rollback;
