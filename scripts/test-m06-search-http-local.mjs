import { spawnSync } from "node:child_process";

const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3111";
const container = "supabase_db_phan-gia-pha-local";
const treeId = "26000000-0000-4000-8000-000000000001";
const personId = "46000000-0000-4000-8000-000000000001";
const secondPersonId = "46000000-0000-4000-8000-000000000002";
const nameId = "66000000-0000-4000-8000-000000000001";
const secondNameId = "66000000-0000-4000-8000-000000000002";
const branchId = "86000000-0000-4000-8000-000000000001";
const firstFactId = "76000000-0000-4000-8000-000000000001";
const secondFactId = "76000000-0000-4000-8000-000000000002";

function sqlString(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
function runPsql(sql) {
  return spawnSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8", windowsHide: true });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const setup = runPsql(`
insert into private.trees (id, slug, name, data_mode) values (${sqlString(treeId)}, 'm06-http-test', 'Synthetic M06 HTTP Test', 'demo');
insert into private.branches (id, tree_id, code, name) values (${sqlString(branchId)}, ${sqlString(treeId)}, 'M06', 'Synthetic M06 branch');
insert into private.persons (id, tree_id, code, display_name, name_search, life_status, visibility, protected_minor, primary_branch_id) values
  (${sqlString(personId)}, ${sqlString(treeId)}, 'M06-HTTP-001', 'Phan Đức An', 'phan duc an', 'deceased', 'public', false, ${sqlString(branchId)}),
  (${sqlString(secondPersonId)}, ${sqlString(treeId)}, 'M06-HTTP-002', 'Phan Đức Bình', 'phan duc binh', 'deceased', 'public', false, null);
insert into private.person_names (id, tree_id, person_id, name, name_search, kind, is_preferred) values
  (${sqlString(nameId)}, ${sqlString(treeId)}, ${sqlString(personId)}, 'Phan Đỗ', 'phan do', 'alias', false),
  (${sqlString(secondNameId)}, ${sqlString(treeId)}, ${sqlString(secondPersonId)}, 'Phan Đức Bình', 'phan duc binh', 'preferred', true);
insert into private.person_facts (id, tree_id, person_id, kind, value_date, visibility) values
  (${sqlString(firstFactId)}, ${sqlString(treeId)}, ${sqlString(personId)}, 'birth', '{"year": 1900, "precision": "year"}'::jsonb, 'public'),
  (${sqlString(secondFactId)}, ${sqlString(treeId)}, ${sqlString(secondPersonId)}, 'birth', '{"year": 1901, "precision": "year"}'::jsonb, 'public');
`);
assert(setup.status === 0, "local M06 HTTP fixture setup failed");
try {
  const aliasResponse = await fetch(webUrl + "/api/v1/persons?q=phan%20do");
  const aliasBody = await aliasResponse.json();
  assert(aliasResponse.status === 200, "alias search BFF status was " + aliasResponse.status);
  assert(aliasBody.data?.length === 1, "alias search did not return one authorized fixture");
  assert(aliasBody.data[0].displayName === "Phan Đức An", "search BFF changed canonical display");
  assert(aliasBody.data[0].matchedNames?.[0]?.name === "Phan Đỗ", "search BFF omitted alias display");

  const firstPageResponse = await fetch(webUrl + "/api/v1/persons?q=phan&limit=1");
  const firstPage = await firstPageResponse.json();
  assert(firstPageResponse.status === 200 && firstPage.data?.length === 1, "first search page was not bounded to one result");
  assert(firstPage.page?.hasMore === true && typeof firstPage.page.nextCursor === "string", "first page did not return an opaque cursor");

  const secondPageResponse = await fetch(webUrl + "/api/v1/persons?q=phan&limit=1&cursor=" + encodeURIComponent(firstPage.page.nextCursor));
  const secondPage = await secondPageResponse.json();
  assert(secondPageResponse.status === 200 && secondPage.data?.length === 1, "cursor page did not return the next result");
  assert(secondPage.data[0].id !== firstPage.data[0].id, "cursor pagination duplicated the first result");

  const filterResponse = await fetch(webUrl + "/api/v1/persons?q=phan&branchId=" + branchId + "&lifeStatus=deceased&birthYear=1900");
  const filterBody = await filterResponse.json();
  assert(filterResponse.status === 200 && filterBody.data?.length === 1, "filter BFF did not narrow to one authorized result");
  assert(filterBody.data[0].id === personId, "filter BFF returned the wrong canonical person");
  console.log("PASS local M06-01/M06-02 HTTP: canonical alias, filters and stable opaque cursor");
} finally {
  const cleanup = runPsql(`
delete from private.person_facts where id in (${sqlString(firstFactId)}, ${sqlString(secondFactId)});
delete from private.person_names where id in (${sqlString(nameId)}, ${sqlString(secondNameId)});
delete from private.persons where id in (${sqlString(personId)}, ${sqlString(secondPersonId)});
delete from private.branches where id = ${sqlString(branchId)};
delete from private.trees where id = ${sqlString(treeId)};
`);
  if (cleanup.status !== 0) {
    process.stderr.write(cleanup.stderr || cleanup.stdout || "local M06 HTTP fixture cleanup failed\\n");
    process.exitCode = 1;
  }
}