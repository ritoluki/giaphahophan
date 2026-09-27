begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '22000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm05-kinship@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'),
       ('00000000-0000-0000-0000-000000000000', '22000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm05-kinship-suspended@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');
insert into private.trees (id, created_by, slug, name, data_mode) values ('12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'm05-kinship-test', 'Synthetic M05 Kinship Test', 'demo');
insert into private.persons (id, tree_id, created_by, code, display_name, name_search, life_status, visibility)
values
  ('32000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'M05-A', 'Synthetic A', 'synthetic a', 'deceased', 'public'),
  ('32000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'M05-B', 'Synthetic B', 'synthetic b', 'deceased', 'public'),
  ('32000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'M05-C', 'Synthetic C', 'synthetic c', 'deceased', 'public'),
  ('32000000-0000-4000-8000-000000000004', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'M05-HIDDEN', 'Synthetic Hidden', 'synthetic hidden', 'living', 'restricted');
insert into private.sources (id, tree_id, created_by, title, kind, provenance) values ('42000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Synthetic M05 Source', 'document', 'Synthetic local M05 test only');
insert into private.parent_links (id, tree_id, created_by, parent_id, child_id, kind, status, source_id)
values
  ('62000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'biological', 'confirmed', '42000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000003', 'adoptive', 'confirmed', '42000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', 'biological', 'confirmed', '42000000-0000-4000-8000-000000000001');
insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values ('92000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'member', 'active'), ('92000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'member', 'suspended');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_result jsonb;
begin
  v_result := api.person_kinship('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', true);
  if v_result ->> 'status' <> 'found' then raise exception 'visible kinship path was not found: %', v_result; end if;
  if not jsonb_path_exists(v_result, '$.paths[0][*] ? (@.via == "adoptive_child")') then raise exception 'adoptive relation direction was not preserved'; end if;
  v_result := api.person_kinship('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', false);
  if v_result ->> 'status' <> 'not_found_within_visible_graph' then raise exception 'adoptive exclusion did not deny path'; end if;
  perform set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
  v_result := api.person_kinship('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', true);
  if v_result ->> 'status' <> 'not_found_within_visible_graph' or jsonb_array_length(v_result -> 'paths') <> 0 then raise exception 'hidden endpoint leaked through kinship'; end if;
end;
$$;

rollback;