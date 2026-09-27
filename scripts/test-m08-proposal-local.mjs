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

  const draftPayload = {
    kind: "addition",
    reason: "Synthetic M08 draft with source",
    items: [{ targetKind: "person", targetId: null, baseVersion: null, operation: "create", fieldChanges: { display_name: "Synthetic M08 Draft Person", life_status: "unknown", visibility: "restricted", protected_minor: false, confidence: "unverified" }, sourceIds: [sourceId] }]
  };
  const draftKey = randomUUID();
  const draft = await jsonRequest(webUrl + "/api/v1/proposals/draft", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": draftKey, Cookie: cookie }, body: JSON.stringify({ treeId, branchId, ...draftPayload }) });
  assert(draft.response.status === 201 && draft.body?.data?.status === "draft", "M08 draft was not saved");
  const draftId = draft.body.data.id;
  const draftHistory = await jsonRequest(webUrl + "/api/v1/proposals/" + draftId + "/history", { headers: { Cookie: cookie } });
  assert(draftHistory.response.status === 200 && draftHistory.body?.data?.entries?.some((entry) => entry.status === "drafted"), "M08 draft history did not include drafted event");
  const submitKey = randomUUID();
  const submittedDraft = await jsonRequest(webUrl + "/api/v1/proposals/" + draftId + "/submit", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submitKey, Cookie: cookie }, body: JSON.stringify({ reason: "Synthetic author submits the completed draft" }) });
  assert(submittedDraft.response.status === 200 && submittedDraft.body?.data?.status === "submitted", "M08 draft submit transition failed");
  const replayFirst = await jsonRequest(webUrl + "/api/v1/proposals/" + draftId + "/submit", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submitKey, Cookie: cookie }, body: JSON.stringify({ reason: "Synthetic author submits the completed draft" }) });
  assert(replayFirst.response.status === 200 && replayFirst.body?.data?.id === draftId && replayFirst.body?.data?.version === submittedDraft.body?.data?.version, "M08 submit idempotency replay failed");
  const withdrawKey = randomUUID();
  const withdrawn = await jsonRequest(webUrl + "/api/v1/proposals/" + draftId + "/withdraw", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": withdrawKey, Cookie: cookie }, body: JSON.stringify({ reason: "Synthetic author withdraws before review" }) });
  assert(withdrawn.response.status === 200 && withdrawn.body?.data?.status === "withdrawn", "M08 withdraw transition failed");
  const withdrawnReplay = await jsonRequest(webUrl + "/api/v1/proposals/" + draftId + "/withdraw", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": withdrawKey, Cookie: cookie }, body: JSON.stringify({ reason: "Synthetic author withdraws before review" }) });
  assert(withdrawnReplay.response.status === 200 && withdrawnReplay.body?.data?.id === draftId && withdrawnReplay.body?.data?.status === "withdrawn", "M08 withdraw idempotency replay failed");
  const terminalWithdraw = await jsonRequest(webUrl + "/api/v1/proposals/" + draftId + "/withdraw", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookie }, body: JSON.stringify({ reason: "Synthetic invalid terminal transition" }) });
  assert(terminalWithdraw.response.status === 409, "M08 terminal lifecycle transition was not rejected");
  const lifecycleHistory = await jsonRequest(webUrl + "/api/v1/proposals/" + draftId + "/history", { headers: { Cookie: cookie } });
  const lifecycleStatuses = new Set((lifecycleHistory.body?.data?.entries ?? []).map((entry) => entry.status));
  assert(lifecycleHistory.response.status === 200 && lifecycleStatuses.has("drafted") && lifecycleStatuses.has("submitted") && lifecycleStatuses.has("withdrawn"), "M08 lifecycle history is incomplete");
  const proposals = [];
  const payloads = [
    { kind: "addition", reason: "Synthetic M08 addition with source", items: [{ targetKind: "person", targetId: null, baseVersion: null, operation: "create", fieldChanges: { display_name: "Synthetic Proposed Person", life_status: "unknown", visibility: "restricted", protected_minor: false, confidence: "unverified" }, sourceIds: [sourceId] }] },
    { kind: "correction", reason: "Synthetic M08 correction with source", baseSnapshot: { person: { version: 1, display_name: "Synthetic M08 Person", recorded_sex: "unknown", life_status: "unknown", visibility: "public", protected_minor: false, primary_branch_id: null, biography: null, confidence: "unverified" } }, items: [{ targetKind: "person", targetId: personId, baseVersion: 1, operation: "update", fieldChanges: { display_name: "Synthetic Proposed Name" }, sourceIds: [sourceId] }] },
    { kind: "relationship", reason: "Synthetic M08 relationship with source", items: [{ targetKind: "parent_link", targetId: null, baseVersion: null, operation: "create", fieldChanges: { parent_id: personId, child_id: personId, kind: "biological", status: "confirmed", source_id: sourceId }, sourceIds: [sourceId] }] }
  ];
  for (const payload of payloads) {
    const submitted = await jsonRequest(webUrl + "/api/v1/proposals", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookie }, body: JSON.stringify({ treeId, branchId, ...payload }) });
    assert(submitted.response.status === 201 && submitted.body?.data?.status === "submitted", `M08 ${payload.kind} proposal was not submitted`);
    proposals.push(submitted.body.data);
  }
  const detail = await jsonRequest(webUrl + "/api/v1/proposals/" + proposals[0].id, { headers: { Cookie: cookie } });
  assert(detail.response.status === 200 && /^PGP-[A-Z0-9]{10}$/.test(detail.body?.data?.trackingCode) && detail.body?.data?.items?.[0]?.sourceIds?.[0] === sourceId, "proposal detail did not expose tracking code/source projection");
  const diff = await jsonRequest(webUrl + "/api/v1/proposals/" + proposals[1].id + "/diff", { headers: { Cookie: cookie } });
  assert(diff.response.status === 200 && diff.body?.data?.items?.[0]?.base?.display_name === "Synthetic M08 Person" && diff.body?.data?.items?.[0]?.current?.version === 1 && diff.body?.data?.items?.[0]?.isStale === false, "proposal diff did not expose base/current/proposed projection");
  const canonical = runPsql(`select (select count(*) from private.persons where tree_id = ${sqlString(treeId)}) || '|' || (select count(*) from private.parent_links where tree_id = ${sqlString(treeId)});`);
  assert(canonical.status === 0 && /1\|0/.test(canonical.stdout), "canonical data changed before approval");
  console.log("PASS local M08-01/M08-02/M08-05: authorized context, sourced proposals, tracking detail, base/current/proposed diff, lifecycle transitions/history and canonical unchanged before approval");
} finally {
  runPsql(["begin;", `delete from private.outbox where tree_id = ${sqlString(treeId)};`, `delete from private.audit_events where tree_id = ${sqlString(treeId)};`, `delete from private.idempotency_records where tree_id = ${sqlString(treeId)};`, `delete from private.review_decisions where tree_id = ${sqlString(treeId)};`, `delete from private.proposal_items where tree_id = ${sqlString(treeId)};`, `delete from private.proposals where tree_id = ${sqlString(treeId)};`, `delete from private.capability_grants where tree_id = ${sqlString(treeId)};`, `delete from private.memberships where tree_id = ${sqlString(treeId)};`, `delete from private.parent_links where tree_id = ${sqlString(treeId)};`, `delete from private.person_names where tree_id = ${sqlString(treeId)};`, `delete from private.persons where tree_id = ${sqlString(treeId)};`, `delete from private.sources where tree_id = ${sqlString(treeId)};`, `delete from private.branches where tree_id = ${sqlString(treeId)};`, `delete from private.trees where id = ${sqlString(treeId)};`, "commit;"].join("\n"));
  await deleteUser(env, userId);
}
