-- Synthetic-only TC-M03-01 test. Names may repeat; UUID/code identify people.

begin;

insert into private.trees (id, created_by, slug, name, data_mode)
values (
  '13000000-0000-4000-8000-000000000001',
  null,
  'm03-identity-test',
  'Synthetic M03 Identity Test',
  'demo'
);

insert into private.persons (
  id, tree_id, code, display_name, name_search, life_status, visibility, protected_minor
) values
(
  '33000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  'M03-PERSON-001',
  'Synthetic Nguyễn Trung',
  'synthetic nguyen trung',
  'deceased',
  'public',
  false
),
(
  '33000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000001',
  'M03-PERSON-002',
  'Synthetic Nguyễn Trung',
  'synthetic nguyen trung',
  'deceased',
  'public',
  false
),
(
  '33000000-0000-4000-8000-000000000003',
  '13000000-0000-4000-8000-000000000001',
  'M03-PERSON-003',
  'Restricted Nguyễn Trung',
  'restricted nguyen trung',
  'unknown',
  'restricted',
  false
);

insert into private.person_names (
  id, tree_id, person_id, name, name_search, kind, is_preferred
) values
(
  '53000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  'Synthetic Nguyễn Trung',
  'synthetic nguyen trung',
  'preferred',
  true
),
(
  '53000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  'Nguyễn Trung',
  'nguyen trung',
  'alias',
  false
),
(
  '53000000-0000-4000-8000-000000000003',
  '13000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  'Nguyễn Trung',
  'nguyen trung',
  'alias',
  false
);

set local role anon;

select count(*) as public_person_count
from api.person_get('33000000-0000-4000-8000-000000000001');
\gset m03_public_person_
select case when :'m03_public_person_public_person_count'::integer = 1 then 1 else 1 / 0 end;

select count(*) as public_name_count
from api.person_names_get('33000000-0000-4000-8000-000000000001');
\gset m03_public_name_
select case when :'m03_public_name_public_name_count'::integer = 3 then 1 else 1 / 0 end;

select count(*) as duplicate_display_name_count
from api.person_get('33000000-0000-4000-8000-000000000002')
where display_name = 'Synthetic Nguyễn Trung';
\gset m03_duplicate_
select case when :'m03_duplicate_duplicate_display_name_count'::integer = 1 then 1 else 1 / 0 end;

select count(*) as restricted_person_count
from api.person_get('33000000-0000-4000-8000-000000000003');
\gset m03_restricted_person_
select case when :'m03_restricted_person_restricted_person_count'::integer = 0 then 1 else 1 / 0 end;

select count(*) as restricted_name_count
from api.person_names_get('33000000-0000-4000-8000-000000000003');
\gset m03_restricted_name_
select case when :'m03_restricted_name_restricted_name_count'::integer = 0 then 1 else 1 / 0 end;

do $$
begin
  begin
    perform count(*) from private.person_names;
    raise exception 'anon role could read private identity table';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
