import { spawnSync } from "node:child_process";

const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3111";
const container = "supabase_db_phan-gia-pha-local";
const treeId = "26000000-0000-4000-8000-000000000001";
const personId = "46000000-0000-4000-8000-000000000001";
const nameId = "66000000-0000-4000-8000-000000000001";

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
insert into private.persons (id, tree_id, code, display_name, name_search, life_status, visibility, protected_minor) values (${sqlString(personId)}, ${sqlString(treeId)}, 'M06-HTTP-001', 'Phan Đức An', 'phan duc an', 'deceased', 'public', false);
insert into private.person_names (id, tree_id, person_id, name, name_search, kind, is_preferred) values (${sqlString(nameId)}, ${sqlString(treeId)}, ${sqlString(personId)}, 'Phan Đỗ', 'phan do', 'alias', false);
`);
assert(setup.status === 0, "local M06 HTTP fixture setup failed");
try {
  const response = await fetch(webUrl + "/api/v1/persons?q=phan%20do");
  const body = await response.json();
  assert(response.status === 200, "search BFF status was " + response.status);
  assert(body.data?.length === 1, "search BFF did not return one authorized fixture");
  assert(body.data[0].displayName === "Phan Đức An", "search BFF changed canonical display");
  assert(body.data[0].matchedNames?.[0]?.name === "Phan Đỗ", "search BFF omitted alias display");
  console.log("PASS local M06-01 HTTP: BFF schema, canonical display and alias projection");
} finally {
  const cleanup = runPsql(`
delete from private.person_names where id = ${sqlString(nameId)};
delete from private.persons where id = ${sqlString(personId)};
delete from private.trees where id = ${sqlString(treeId)};
`);
  if (cleanup.status !== 0) {
    process.stderr.write(cleanup.stderr || cleanup.stdout || "local M06 HTTP fixture cleanup failed\\n");
    process.exitCode = 1;
  }
}