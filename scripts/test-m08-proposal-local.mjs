import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = "supabase_db_phan-gia-pha-local";
const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3123";
function localEnv() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) { const match = /^([A-Z_]+)=(.*)$/.exec(line); if (match) values[match[1]] = match[2].replace(/^"|"$/g, ""); }
  if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local status missing required values");
  return values;
}
function sqlString(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function runPsql(sql) { return spawnSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8", windowsHide: true }); }
async function jsonRequest(url, init) { const response = await fetch(url, init); let body = null; try { body = await response.json(); } catch {} return { response, body }; }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function createUser(env, email, password) { const result = await jsonRequest(env.API_URL + "/auth/v1/admin/users", { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) }); assert(result.response.ok && result.body?.id, "synthetic proposal user creation failed"); return result.body.id; }
async function deleteUser(env, id) { if (id) await fetch(env.API_URL + "/auth/v1/admin/users/" + id, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY } }); }
async function login(env, email, password) { const result = await jsonRequest(webUrl + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); assert(result.response.ok && result.body?.data?.authenticated === true, "proposal BFF login failed"); return result.response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; "); }

const env = localEnv();
const treeId = randomUUID(); const branchId = randomUUID(); const personId = randomUUID(); const sourceId = randomUUID(); const membershipId = randomUUID(); const grantId = randomUUID();
const email = "m08-" + randomUUID() + "@synthetic.test"; const password = "Synthetic!" + randomUUID(); let userId;
try {
  userId = await createUser(env, email, password);
  const seed = [
    "begin;",
    `insert into private.trees (id, created_by, slug, name, data_mode) values (${sqlString(treeId)}, ${sqlString(userId)}, ${sqlString("m08-" + treeId)}, 'Synthetic M08 Tree', 'demo');`,
    `insert into private.branches (id, tree_id, created_by, code, name) values (${sqlString(branchId)}, ${sqlString(treeId)}, ${sqlString(userId)}, 'M08', 'Synthetic M08 Branch');`,
    `insert into private.persons (id, tree_id, created_by, code, display_name, name_search, visibility, protected_minor) values (${sqlString(personId)}, ${sqlString(treeId)}, ${sqlString(userId)}, 'M08-PERSON', 'Synthetic M08 Person', 'synthetic m08 person', 'public', false);`,
    `insert into private.sources (id, tree_id, created_by, title, kind, provenance) values (${sqlString(sourceId)}, ${sqlString(treeId)}, ${sqlString(userId)}, 'Synthetic M08 Source', 'oral', 'Synthetic local test only');`,
    `insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (${sqlString(membershipId)}, ${sqlString(treeId)}, ${sqlString(userId)}, ${sqlString(userId)}, 'editor', 'active');`,
    `insert into private.capability_grants (id, tree_id, created_by, membership_id, capability) values (${sqlString(grantId)}, ${sqlString(treeId)}, ${sqlString(userId)}, ${sqlString(membershipId)}, 'proposal.submit');`,
    "commit;"
  ].join("\n");
  const seeded = runPsql(seed); assert(seeded.status === 0, "M08 fixture seed failed");
  const cookie = await login(env, email, password);
  const context = await jsonRequest(webUrl + "/api/v1/proposals/context", { headers: { Cookie: cookie } });
  assert(context.response.status === 200 && context.body?.data?.some((row) => row.treeId === treeId && row.branchId === null), "proposal submit context did not expose authorized tree");

  const proposals = [];
  const payloads = [
    { kind: "addition", reason: "Synthetic M08 addition with source", items: [{ targetKind: "person", targetId: null, baseVersion: null, operation: "create", fieldChanges: { display_name: "Synthetic Proposed Person", life_status: "unknown", visibility: "restricted", protected_minor: false, confidence: "unverified" }, sourceIds: [sourceId] }] },
    { kind: "correction", reason: "Synthetic M08 correction with source", items: [{ targetKind: "person", targetId: personId, baseVersion: 1, operation: "update", fieldChanges: { display_name: "Synthetic Proposed Name" }, sourceIds: [sourceId] }] },
    { kind: "relationship", reason: "Synthetic M08 relationship with source", items: [{ targetKind: "parent_link", targetId: null, baseVersion: null, operation: "create", fieldChanges: { parent_id: personId, child_id: personId, kind: "biological", status: "confirmed", source_id: sourceId }, sourceIds: [sourceId] }] }
  ];
  for (const payload of payloads) {
    const submitted = await jsonRequest(webUrl + "/api/v1/proposals", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookie }, body: JSON.stringify({ treeId, branchId, ...payload }) });
    assert(submitted.response.status === 201 && submitted.body?.data?.status === "submitted", `M08 ${payload.kind} proposal was not submitted`);
    proposals.push(submitted.body.data);
  }
  const detail = await jsonRequest(webUrl + "/api/v1/proposals/" + proposals[0].id, { headers: { Cookie: cookie } });
  assert(detail.response.status === 200 && /^PGP-[A-Z0-9]{10}$/.test(detail.body?.data?.trackingCode) && detail.body?.data?.items?.[0]?.sourceIds?.[0] === sourceId, "proposal detail did not expose tracking code/source projection");
  const canonical = runPsql(`select (select count(*) from private.persons where tree_id = ${sqlString(treeId)}) || '|' || (select count(*) from private.parent_links where tree_id = ${sqlString(treeId)});`);
  assert(canonical.status === 0 && /1\|0/.test(canonical.stdout), "canonical data changed before approval");
  console.log("PASS local M08-01: authorized context, sourced addition/correction/relationship proposals, tracking detail and canonical unchanged before approval");
} finally {
  runPsql(["begin;", `delete from private.outbox where tree_id = ${sqlString(treeId)};`, `delete from private.audit_events where tree_id = ${sqlString(treeId)};`, `delete from private.idempotency_records where tree_id = ${sqlString(treeId)};`, `delete from private.review_decisions where tree_id = ${sqlString(treeId)};`, `delete from private.proposal_items where tree_id = ${sqlString(treeId)};`, `delete from private.proposals where tree_id = ${sqlString(treeId)};`, `delete from private.capability_grants where tree_id = ${sqlString(treeId)};`, `delete from private.memberships where tree_id = ${sqlString(treeId)};`, `delete from private.parent_links where tree_id = ${sqlString(treeId)};`, `delete from private.person_names where tree_id = ${sqlString(treeId)};`, `delete from private.persons where tree_id = ${sqlString(treeId)};`, `delete from private.sources where tree_id = ${sqlString(treeId)};`, `delete from private.branches where tree_id = ${sqlString(treeId)};`, `delete from private.trees where id = ${sqlString(treeId)};`, "commit;"].join("\n"));
  await deleteUser(env, userId);
}