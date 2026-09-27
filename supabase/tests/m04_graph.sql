-- Synthetic-only M04-01 graph projection test. Transaction rolls back all fixtures.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm04-a@example.test', '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');

insert into private.trees (id, created_by, slug, name, data_mode)
values ('11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'm04-graph-test', 'Synthetic M04 Graph Test', 'demo');

insert into private.branches (id, tree_id, created_by, code, name)
values ('51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M04', 'Synthetic M04 Branch');

insert into private.persons (id, tree_id, created_by, code, display_name, name_search, life_status, visibility, primary_branch_id)
values
  ('31000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M04-ROOT', 'Synthetic Root', 'synthetic root', 'deceased', 'public', '51000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M04-CHILD', 'Synthetic Child', 'synthetic child', 'deceased', 'public', '51000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M04-ADOPTIVE', 'Synthetic Adoptive Parent', 'synthetic adoptive parent', 'deceased', 'public', '51000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M04-PARTNER', 'Synthetic Partner', 'synthetic partner', 'deceased', 'public', '51000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000005', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'M04-DISCONNECTED', 'Synthetic Disconnected Root', 'synthetic disconnected root', 'unknown', 'public', '51000000-0000-4000-8000-000000000001');

insert into private.sources (id, tree_id, created_by, title, kind, provenance)
values ('41000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Synthetic M04 Source', 'document', 'Synthetic local test only');

insert into private.parent_links (id, tree_id, created_by, parent_id, child_id, kind, status, source_id)
values
  ('61000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'biological', 'confirmed', '41000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000002', 'adoptive', 'disputed', '41000000-0000-4000-8000-000000000001');

insert into private.unions (id, tree_id, created_by, kind, status)
values ('71000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'marriage', 'active');

insert into private.union_partners (id, tree_id, union_id, person_id, ordinal)
values
  ('81000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 1),
  ('81000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000004', 2);

insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status)
values ('91000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'member', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_graph jsonb;
begin
  v_graph := api.person_graph('31000000-0000-4000-8000-000000000002', 'ancestors', 3, 120);
  if jsonb_array_length(v_graph -> 'nodes') <> 3 then raise exception 'ancestor graph expected root, child and adoptive parent'; end if;
  if not jsonb_path_exists(v_graph, '$.edges[*] ? (@.kind == "adoptive" && @.status == "disputed")') then raise exception 'disputed adoptive edge was not preserved'; end if;
  v_graph := api.person_graph('31000000-0000-4000-8000-000000000002', 'family', 2, 120);
  if not jsonb_path_exists(v_graph, '$.edges[*] ? (@.kind == "union")') then raise exception 'family graph did not include union edge'; end if;
  v_graph := api.person_graph('31000000-0000-4000-8000-000000000001', 'descendants', 1, 1);
  if (v_graph ->> 'truncated')::boolean is not true then raise exception 'node cap did not mark graph truncated'; end if;
  v_graph := api.person_graph('31000000-0000-4000-8000-000000000001', 'roots', 3, 120);
  if not jsonb_path_exists(v_graph, '$.nodes[*].person.code ? (@ == "M04-DISCONNECTED")') then raise exception 'disconnected root was not returned'; end if;
end;
$$;

rollback;
