-- Synthetic-only M13-04 test. The transaction is rolled back.
begin;

insert into private.trees (id, created_by, slug, name, data_mode)
values ('a4800000-0000-4000-8000-000000000001', null, 'm13-map-test', 'Synthetic M13 Map Test', 'demo');

set local role service_role;
select * from private.map_provider_quota_consume(
  'a4800000-0000-4000-8000-000000000001', 'google_maps',
  '2026-09-28 10:00:00+07', '2026-09-28 00:00:00+07', 2, 3
) \gset first_
select case when :'first_allowed' = 't' and :'first_minute_used' = '1' and :'first_day_used' = '1' then 1 else 1 / 0 end;

select * from private.map_provider_quota_consume(
  'a4800000-0000-4000-8000-000000000001', 'google_maps',
  '2026-09-28 10:00:00+07', '2026-09-28 00:00:00+07', 2, 3
) \gset second_
select case when :'second_allowed' = 't' and :'second_minute_used' = '2' and :'second_day_used' = '2' then 1 else 1 / 0 end;

select * from private.map_provider_quota_consume(
  'a4800000-0000-4000-8000-000000000001', 'google_maps',
  '2026-09-28 10:00:00+07', '2026-09-28 00:00:00+07', 2, 3
) \gset third_
select case when :'third_allowed' = 'f' and :'third_minute_used' = '2' and :'third_day_used' = '2' then 1 else 1 / 0 end;

set local role authenticated;
do $$
begin
  begin
    perform private.map_provider_quota_consume(
      'a4800000-0000-4000-8000-000000000001', 'google_maps',
      '2026-09-28 10:00:00+07', '2026-09-28 00:00:00+07', 2, 3
    );
    raise exception 'authenticated role can consume provider quota';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;