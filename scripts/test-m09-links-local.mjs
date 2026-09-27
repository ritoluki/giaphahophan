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
  assert(result.response.ok && result.body?.id, "synthetic link user creation failed");
  return result.body.id;
}
async function login(email, password) {
  const result = await request(webUrl + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert(result.response.ok, "media link BFF login failed");
  return result.response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

const config = env();
const treeId = randomUUID();
const membershipId = randomUUID();
const readGrantId = randomUUID();
const writeGrantId = randomUUID();
const assetId = randomUUID();
const pageId = randomUUID();
const revisionId = randomUUID();
const ownerEmail = "m09-link-owner-" + randomUUID() + "@synthetic.test";
const ownerPassword = "Synthetic!" + randomUUID();
const restrictedEmail = "m09-link-restricted-" + randomUUID() + "@synthetic.test";
const restrictedPassword = "Synthetic!" + randomUUID();
let ownerId;
let restrictedId;
let linkId;
try {
  ownerId = await createUser(config, ownerEmail, ownerPassword);
  restrictedId = await createUser(config, restrictedEmail, restrictedPassword);
  const seed = [
    "begin;",
    `insert into private.trees (id, created_by, slug, name, data_mode) values (${sql(treeId)}, ${sql(ownerId)}, ${sql("m09-link-" + treeId)}, 'Synthetic Link Tree', 'demo');`,
    `insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (${sql(membershipId)}, ${sql(treeId)}, ${sql(ownerId)}, ${sql(ownerId)}, 'editor', 'active');`,
    `insert into private.capability_grants (id, tree_id, created_by, membership_id, capability) values (${sql(readGrantId)}, ${sql(treeId)}, ${sql(ownerId)}, ${sql(membershipId)}, 'media.read'), (${sql(writeGrantId)}, ${sql(treeId)}, ${sql(ownerId)}, ${sql(membershipId)}, 'media.write');`,
    `insert into private.media_assets (id, tree_id, created_by, filename, declared_mime, mime_type, size_bytes, actual_size_bytes, expected_sha256, actual_sha256, purpose, visibility, state, object_path, alt_text) values (${sql(assetId)}, ${sql(treeId)}, ${sql(ownerId)}, 'synthetic-public-article.png', 'image/png', 'image/png', 8, 8, ${sql("a".repeat(64))}, ${sql("a".repeat(64))}, 'source', 'restricted', 'ready', ${sql(ownerId + "/" + assetId + "/original")}, 'Synthetic private asset');`,
    `insert into private.content_pages (id, tree_id, created_by, slug, kind, visibility) values (${sql(pageId)}, ${sql(treeId)}, ${sql(ownerId)}, 'synthetic-public-article', 'history', 'public');`,
    `insert into private.content_revisions (id, tree_id, created_by, page_id, title, body, status, approved_by) values (${sql(revisionId)}, ${sql(treeId)}, ${sql(ownerId)}, ${sql(pageId)}, 'Synthetic public article', '{"type":"doc","content":[]}', 'published', ${sql(ownerId)});`,
    `update private.content_pages set published_revision_id = ${sql(revisionId)} where tree_id = ${sql(treeId)} and id = ${sql(pageId)};`,
    "commit;"
  ].join("\n");
  assert(psql(seed).status === 0, "media link fixture seed failed");
  const ownerCookie = await login(ownerEmail, ownerPassword);
  const input = { contentRevisionId: revisionId, caption: "Synthetic public article image" };
  const key = randomUUID();
  const created = await request(webUrl + "/api/v1/media/" + assetId + "/links?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, Cookie: ownerCookie }, body: JSON.stringify(input) });
  assert(created.response.status === 201 && created.body?.data?.assetId === assetId, "media link create failed");
  linkId = created.body.data.id;
  const replay = await request(webUrl + "/api/v1/media/" + assetId + "/links?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, Cookie: ownerCookie }, body: JSON.stringify(input) });
  assert(replay.response.status === 201 && replay.body?.data?.id === linkId, "media link idempotency replay failed");
  const links = await request(webUrl + "/api/v1/media/" + assetId + "/links?treeId=" + treeId, { headers: { Cookie: ownerCookie } });
  assert(links.response.ok && links.body?.data?.length === 1, "media link persistence/list failed");
  const invalid = await request(webUrl + "/api/v1/media/" + assetId + "/links?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: ownerCookie }, body: JSON.stringify({ personId: randomUUID(), sourceId: randomUUID() }) });
  assert(invalid.response.status === 422, "media link accepted multiple targets");
  const orphan = await request(webUrl + "/api/v1/media/" + assetId + "/links?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: ownerCookie }, body: JSON.stringify({ contentRevisionId: randomUUID() }) });
  assert(orphan.response.status === 409, "media link accepted orphan target");
  const visibility = psql(`select m.visibility, p.visibility, r.status from private.media_assets m join private.content_pages p on p.tree_id = ${sql(treeId)} and p.id = ${sql(pageId)} join private.content_revisions r on r.tree_id = ${sql(treeId)} and r.id = ${sql(revisionId)} where m.tree_id = ${sql(treeId)} and m.id = ${sql(assetId)};`);
  assert(visibility.status === 0 && visibility.stdout.replaceAll(" ", "").includes("restricted|public|published"), "media link changed asset or article visibility");
  const restrictedCookie = await login(restrictedEmail, restrictedPassword);
  const restrictedGet = await request(webUrl + "/api/v1/media/" + assetId + "/links?treeId=" + treeId, { headers: { Cookie: restrictedCookie } });
  assert(restrictedGet.response.ok && restrictedGet.body?.data?.length === 0, "restricted member received private media links");
  const restrictedPost = await request(webUrl + "/api/v1/media/" + assetId + "/links?treeId=" + treeId, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: restrictedCookie }, body: JSON.stringify({ contentRevisionId: revisionId }) });
  assert(restrictedPost.response.status === 403, "restricted member created private media link");
  console.log("PASS local M09-04: private asset link to public revision, visibility isolation, idempotency, exact-one validation, FK denial and capability denial");
} finally {
  psql([
    "begin;",
    "delete from private.outbox where tree_id = " + sql(treeId) + ";",
    "delete from private.audit_events where tree_id = " + sql(treeId) + ";",
    "delete from private.idempotency_records where tree_id = " + sql(treeId) + ";",
    "delete from private.media_links where tree_id = " + sql(treeId) + ";",
    "delete from private.content_revisions where tree_id = " + sql(treeId) + ";",
    "delete from private.content_pages where tree_id = " + sql(treeId) + ";",
    "delete from private.media_assets where tree_id = " + sql(treeId) + ";",
    "delete from private.capability_grants where tree_id = " + sql(treeId) + ";",
    "delete from private.memberships where tree_id = " + sql(treeId) + ";",
    "delete from private.trees where id = " + sql(treeId) + ";",
    "commit;"
  ].join("\n"));
  for (const id of [ownerId, restrictedId]) if (id) await fetch(config.API_URL + "/auth/v1/admin/users/" + id, { method: "DELETE", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: "Bearer " + config.SERVICE_ROLE_KEY } });
}