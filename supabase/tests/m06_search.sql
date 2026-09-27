-- Synthetic-only TC-M06-01/M06-02 test. Search normalizes accents,
-- preserves aliases, filters authorized facts and paginates by stable cursor.

begin;

insert into private.trees (id, slug, name, data_mode)
values ('16000000-0000-4000-8000-000000000001', 'm06-search-test', 'Synthetic M06 Search Test', 'demo');

insert into private.persons (id, tree_id, code, display_name, name_search, life_status, visibility, protected_minor)
values
  ('36000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'M06-P001', 'Phan Đức An', 'phan duc an', 'deceased', 'public', false),
  ('36000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', 'M06-P002', 'Restricted Phan Đỗ', 'restricted phan do', 'unknown', 'restricted', false),
  ('36000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000001', 'M06-P003', 'Phan Đức Bình', 'phan duc binh', 'deceased', 'public', false);

insert into private.branches (id, tree_id, code, name)
values ('56000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'M06', 'Synthetic M06 branch');
update private.persons set primary_branch_id = '56000000-0000-4000-8000-000000000001' where id = '36000000-0000-4000-8000-000000000001';

insert into private.person_facts (id, tree_id, person_id, kind, value_date, visibility)
values
  ('76000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', 'birth', '{"year": 1900, "precision": "year"}'::jsonb, 'public'),
  ('76000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000003', 'birth', '{"year": 1901, "precision": "year"}'::jsonb, 'public');

insert into private.person_names (id, tree_id, person_id, name, name_search, kind, is_preferred)
values
  ('56000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', 'Phan Đức An', 'phan duc an', 'preferred', true),
  ('56000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', 'Phan Đỗ', 'phan do', 'alias', false),
  ('56000000-0000-4000-8000-000000000004', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000002', 'Phan Đỗ', 'phan do', 'preferred', true);

set local role anon;

do $$
declare
  v_count integer;
  v_display text;
  v_cursor uuid;
  v_matched jsonb;
begin
  select count(*) into v_count from api.persons_search(p_query => 'phan do', p_limit => 20);
  if v_count <> 1 then raise exception 'accent-insensitive public search expected one visible result, got %', v_count; end if;

  select display_name, matched_names into v_display, v_matched
  from api.persons_search(p_query => 'PHAN ĐỖ', p_limit => 20);
  if v_display <> 'Phan Đức An' then raise exception 'canonical display was not preserved: %', v_display; end if;
  if not (v_matched @> '[{"name":"Phan Đỗ","kind":"alias"}]'::jsonb) then raise exception 'alias was not returned in matched names: %', v_matched; end if;

  select count(*) into v_count from api.persons_search(p_query => 'restricted phan do', p_limit => 20);
  if v_count <> 0 then raise exception 'restricted person leaked to anonymous search'; end if;

  select count(*) into v_count from api.persons_search(p_query => 'phan', p_branch_id => '56000000-0000-4000-8000-000000000001'::uuid, p_life_status => 'deceased', p_birth_year => 1900, p_limit => 20);
  if v_count <> 1 then raise exception 'branch/life/year filters expected one result, got %', v_count; end if;

  select id into v_cursor from api.persons_search(p_query => 'phan', p_sort => 'name', p_limit => 1);
  select count(*) into v_count from api.persons_search(p_query => 'phan', p_sort => 'name', p_cursor_person_id => v_cursor, p_limit => 20);
  if v_count <> 1 then raise exception 'keyset cursor expected one next result, got %', v_count; end if;

  select count(*) into v_count from api.persons_search(p_query => '', p_limit => 101);
  if v_count <> 2 then raise exception 'empty search expected only two visible rows, got %', v_count; end if;
end;
$$;

rollback;