import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = "supabase_db_phan-gia-pha-local";
const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3123";
function env() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) { const match = /^([A-Z_]+)=(.*)$/.exec(line); if (match) values[match[1]] = match[2].trim().replace(/^"|"$/g, ""); }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local status missing required values");
  return values;
}
function sql(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function psql(statement) { return spawnSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: statement, encoding: "utf8", windowsHide: true }); }
async function request(url, init) { const response = await fetch(url, init); let body = null; try { body = await response.json(); } catch {} return { response, body }; }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function createUser(config, email, password) {
  const result = await request(config.API_URL + "/auth/v1/admin/users", { method: "POST", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: "Bearer " + config.SERVICE_ROLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
  assert(result.response.ok && result.body?.id, "synthetic source user creation failed");
  const direct = await request(config.API_URL + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: config.SERVICE_ROLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert(direct.response.ok, "direct Supabase login failed status=" + direct.response.status + " body=" + JSON.stringify(direct.body));
  return result.body.id;
}
async function login(email, password) {
  const result = await request(webUrl + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert(result.response.ok, "source BFF login failed status=" + result.response.status + " body=" + JSON.stringify(result.body));
  return result.response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

const config = env();
const treeId = randomUUID();
const membershipId = randomUUID();
const sourceReadGrantId = randomUUID();
const sourceWriteGrantId = randomUUID();
const personId = randomUUID();
const email = "m09-source-" + randomUUID() + "@synthetic.test";
const password = "Synthetic!" + randomUUID();
let userId;
let sourceId;
try {
  userId = await createUser(config, email, password);
  const seed = [
    "begin;",
    `insert into private.trees (id, created_by, slug, name, data_mode) values (${sql(treeId)}, ${sql(userId)}, ${sql("m09-source-" + treeId)}, 'Synthetic Source Tree', 'demo');`,
    `insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (${sql(membershipId)}, ${sql(treeId)}, ${sql(userId)}, ${sql(userId)}, 'editor', 'active');`,
    `insert into private.capability_grants (id, tree_id, created_by, membership_id, capability) values (${sql(sourceReadGrantId)}, ${sql(treeId)}, ${sql(userId)}, ${sql(membershipId)}, 'source.read'), (${sql(sourceWriteGrantId)}, ${sql(treeId)}, ${sql(userId)}, ${sql(membershipId)}, 'source.write');`,
    `insert into private.persons (id, tree_id, created_by, code, display_name, name_search, life_status, visibility) values (${sql(personId)}, ${sql(treeId)}, ${sql(userId)}, 'M09-SOURCE-P1', 'Synthetic Source Person', 'synthetic source person', 'deceased', 'members');`,
    "commit;"
  ].join("\n");
  assert(psql(seed).status === 0, "source fixture seed failed");
  const cookie = await login(email, password);
  const sourceInput = { title: "Synthetic parish register", kind: "book", provenance: "Synthetic fixture only", visibility: "restricted", rightsNote: "Synthetic test" };
  const sourceKey = randomUUID();
  const created = await request(webUrl + "/api/v1/sources?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": sourceKey, Cookie: cookie }, body: JSON.stringify(sourceInput) });
  assert(created.response.status === 201 && created.body?.data?.id, "source create failed");
  sourceId = created.body.data.id;
  const replay = await request(webUrl + "/api/v1/sources?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": sourceKey, Cookie: cookie }, body: JSON.stringify(sourceInput) });
  assert(replay.response.status === 201 && replay.body?.data?.id === sourceId, "source idempotency replay failed");
  const sources = await request(webUrl + "/api/v1/sources?treeId=" + treeId, { headers: { Cookie: cookie } });
  assert(sources.response.ok && sources.body?.data?.some((item) => item.id === sourceId), "source persistence/list projection failed");
  const invalidCitation = await request(webUrl + "/api/v1/sources/" + sourceId + "/citations?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookie }, body: JSON.stringify({ sourceId, locator: "p. 7" }) });
  assert(invalidCitation.response.status === 422, "citation without exactly one target was accepted");
  const citationInput = { sourceId, personId, locator: "p. 7, entry 12", quotedText: "Synthetic citation", confidence: "supported" };
  const citation = await request(webUrl + "/api/v1/sources/" + sourceId + "/citations?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookie }, body: JSON.stringify(citationInput) });
  assert(citation.response.status === 201 && citation.body?.data?.locator === citationInput.locator, "citation create failed");
  const citations = await request(webUrl + "/api/v1/sources/" + sourceId + "/citations?treeId=" + treeId, { headers: { Cookie: cookie } });
  assert(citations.response.ok && citations.body?.data?.length === 1, "citation persistence/list projection failed");
  const orphan = await request(webUrl + "/api/v1/sources/" + sourceId + "/citations?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookie }, body: JSON.stringify({ sourceId, personId: randomUUID(), locator: "p. 99" }) });
  assert(orphan.response.status === 409, "cross-tree/orphan citation target was accepted");
  console.log("PASS local M09-03: source/citation idempotency, exact-one target, real FK persistence and orphan denial");
} finally {
  psql([
    "begin;",
    "delete from private.outbox where tree_id = " + sql(treeId) + ";",
    "delete from private.audit_events where tree_id = " + sql(treeId) + ";",
    "delete from private.idempotency_records where tree_id = " + sql(treeId) + ";",
    "delete from private.citations where tree_id = " + sql(treeId) + ";",
    "delete from private.sources where tree_id = " + sql(treeId) + ";",
    "delete from private.persons where tree_id = " + sql(treeId) + ";",
    "delete from private.capability_grants where tree_id = " + sql(treeId) + ";",
    "delete from private.memberships where tree_id = " + sql(treeId) + ";",
    "delete from private.trees where id = " + sql(treeId) + ";",
    "commit;"
  ].join("\n"));
  if (userId) await fetch(config.API_URL + "/auth/v1/admin/users/" + userId, { method: "DELETE", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: "Bearer " + config.SERVICE_ROLE_KEY } });
}
