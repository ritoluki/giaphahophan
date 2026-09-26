-- Synthetic-only TC-M03-02 test.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '24000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'm03-date-a@example.test',
  '',
  clock_timestamp(),
  clock_timestamp(),
  clock_timestamp(),
  '{}',
  '{}'
);

insert into private.trees (id, created_by, slug, name, data_mode)
values (
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  'm03-dates-test',
  'Synthetic M03 Dates Test',
  'demo'
);

insert into private.persons (
  id, tree_id, created_by, code, display_name, name_search, life_status, visibility
) values
(
  '34000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  'M03-DATE-DECEASED',
  'Synthetic Deceased',
  'synthetic deceased',
  'deceased',
  'public'
),
(
  '34000000-0000-4000-8000-000000000002',
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  'M03-DATE-UNKNOWN',
  'Synthetic Unknown',
  'synthetic unknown',
  'unknown',
  'public'
),
(
  '34000000-0000-4000-8000-000000000003',
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  'M03-DATE-LIVING',
  'Synthetic Living',
  'synthetic living',
  'living',
  'public'
);

insert into private.memberships (
  id, tree_id, created_by, auth_user_id, role, status
) values (
  '64000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  'member',
  'active'
);

insert into private.person_facts (
  id, tree_id, created_by, person_id, kind, value_date, visibility
) values
(
  '54000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  'birth',
  '{"calendar":"gregorian","precision":"year","year":1901,"originalText":"Năm 1901"}',
  'public'
),
(
  '54000000-0000-4000-8000-000000000002',
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000002',
  'birth',
  '{"calendar":"unknown","precision":"unknown","originalText":"Chưa rõ"}',
  'public'
),
(
  '54000000-0000-4000-8000-000000000003',
  '14000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000003',
  'birth',
  '{"calendar":"gregorian","precision":"year","year":1980,"originalText":"Năm 1980"}',
  'public'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select count(*) as public_deceased_people
from api.person_get('34000000-0000-4000-8000-000000000001')
\gset m03_date_deceased_
select case when :'m03_date_deceased_public_deceased_people'::integer = 1 then 1 else 1 / 0 end;

select count(*) as unknown_people
from api.person_get('34000000-0000-4000-8000-000000000002')
\gset m03_date_unknown_
select case when :'m03_date_unknown_unknown_people'::integer = 0 then 1 else 1 / 0 end;

select count(*) as living_people
from api.person_get('34000000-0000-4000-8000-000000000003')
\gset m03_date_living_
select case when :'m03_date_living_living_people'::integer = 0 then 1 else 1 / 0 end;

select count(*) as public_deceased_facts
from api.person_facts_get('34000000-0000-4000-8000-000000000001')
\gset m03_fact_deceased_
select case when :'m03_fact_deceased_public_deceased_facts'::integer = 1 then 1 else 1 / 0 end;

select count(*) as public_unknown_facts
from api.person_facts_get('34000000-0000-4000-8000-000000000002')
\gset m03_fact_unknown_
select case when :'m03_fact_unknown_public_unknown_facts'::integer = 0 then 1 else 1 / 0 end;

set local role authenticated;
select set_config('request.jwt.claim.sub', '24000000-0000-4000-8000-000000000001', true);

select count(*) as member_unknown_people
from api.person_get('34000000-0000-4000-8000-000000000002')
\gset m03_member_unknown_
select case when :'m03_member_unknown_member_unknown_people'::integer = 1 then 1 else 1 / 0 end;

select
  value_date ->> 'precision' as precision,
  value_date ->> 'year' as year,
  value_date ->> 'originalText' as original_text,
  value_date ? 'month' as has_month,
  value_date ? 'day' as has_day
from api.person_facts_get('34000000-0000-4000-8000-000000000001')
\gset m03_year_only_
select case
  when :'m03_year_only_precision' = 'year'
   and :'m03_year_only_year' = '1901'
   and :'m03_year_only_original_text' = 'Năm 1901'
   and :'m03_year_only_has_month' = 'f'
   and :'m03_year_only_has_day' = 'f'
  then 1 else 1 / 0 end;

do $$
begin
  begin
    perform count(*) from private.person_facts;
    raise exception 'authenticated role could read private facts';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
