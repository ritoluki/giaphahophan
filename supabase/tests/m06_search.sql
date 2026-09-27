-- Synthetic-only TC-M06-01 test. Search must normalize Vietnamese accents,
-- preserve canonical display/alias values, and exclude restricted people.

begin;

insert into private.trees (id, slug, name, data_mode)
values ('16000000-0000-4000-8000-000000000001', 'm06-search-test', 'Synthetic M06 Search Test', 'demo');

insert into private.persons (id, tree_id, code, display_name, name_search, life_status, visibility, protected_minor)
values
  ('36000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'M06-P001', 'Phan Đức An', 'phan duc an', 'deceased', 'public', false),
  ('36000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', 'M06-P002', 'Restricted Phan Đỗ', 'restricted phan do', 'unknown', 'restricted', false);

insert into private.person_names (id, tree_id, person_id, name, name_search, kind, is_preferred)
values
  ('56000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', 'Phan Đức An', 'phan duc an', 'preferred', true),
  ('56000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', 'Phan Đỗ', 'phan do', 'alias', false),
  ('56000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000002', 'Phan Đỗ', 'phan do', 'preferred', true);

set local role anon;

do $$
declare
  v_count integer;
  v_display text;
  v_matched jsonb;
begin
  select count(*) into v_count from api.persons_search('phan do', 20);
  if v_count <> 1 then raise exception 'accent-insensitive public search expected one visible result, got %', v_count; end if;

  select display_name, matched_names into v_display, v_matched
  from api.persons_search('PHAN ĐỖ', 20);
  if v_display <> 'Phan Đức An' then raise exception 'canonical display was not preserved: %', v_display; end if;
  if not (v_matched @> '[{"name":"Phan Đỗ","kind":"alias"}]'::jsonb) then raise exception 'alias was not returned in matched names: %', v_matched; end if;

  select count(*) into v_count from api.persons_search('restricted phan do', 20);
  if v_count <> 0 then raise exception 'restricted person leaked to anonymous search'; end if;
end;
$$;

rollback;