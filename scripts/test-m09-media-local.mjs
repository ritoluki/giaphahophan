import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import sharp from "../apps/web/node_modules/sharp/dist/index.mjs";

const container = "supabase_db_phan-gia-pha-local";
const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3123";

function localEnv() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local status missing required values");
  return values;
}
function sqlString(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function runPsql(sql) {
  return spawnSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8", windowsHide: true });
}
async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}
function assert(condition, message) { if (!condition) throw new Error(message); }
async function createUser(env, email, password) {
  const result = await jsonRequest(env.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  assert(result.response.ok && result.body?.id, "synthetic media user creation failed");
  return result.body.id;
}
async function deleteUser(env, id) {
  if (id) await fetch(env.API_URL + "/auth/v1/admin/users/" + id, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY } });
}
async function login(email, password) {
  const result = await jsonRequest(webUrl + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert(result.response.ok && result.body?.data?.authenticated === true, "media BFF login failed");
  return result.response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
const VALID_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
function pngBytes(extra = "") { return Buffer.concat([VALID_PNG, Buffer.from(extra)]); }
async function jpegWithGpsExif() {
  return sharp({ create: { width: 8, height: 4, channels: 3, background: { r: 120, g: 80, b: 40 } } })
    .withExif({ IFD0: { Make: "Synthetic" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "10/1 20/1 30/1", GPSLongitudeRef: "E", GPSLongitude: "106/1 40/1 0/1" } })
    .jpeg()
    .toBuffer();
}

const env = localEnv();
const treeId = randomUUID();
const membershipId = randomUUID();
const grantUploadId = randomUUID();
const grantReadId = randomUUID();
const email = "m09-" + randomUUID() + "@synthetic.test";
const password = "Synthetic!" + randomUUID();
let userId;
const assetIds = [];
try {
  userId = await createUser(env, email, password);
  const seed = [
    "begin;",
    "insert into private.trees (id, created_by, slug, name, data_mode) values (" + sqlString(treeId) + ", " + sqlString(userId) + ", " + sqlString("m09-" + treeId) + ", 'Synthetic M09 Tree', 'demo');",
    "insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (" + sqlString(membershipId) + ", " + sqlString(treeId) + ", " + sqlString(userId) + ", " + sqlString(userId) + ", 'editor', 'active');",
    "insert into private.capability_grants (id, tree_id, created_by, membership_id, capability) values (" + sqlString(grantUploadId) + ", " + sqlString(treeId) + ", " + sqlString(userId) + ", " + sqlString(membershipId) + ", 'media.upload'), (" + sqlString(grantReadId) + ", " + sqlString(treeId) + ", " + sqlString(userId) + ", " + sqlString(membershipId) + ", 'media.read');",
    "commit;"
  ].join("\n");
  assert(runPsql(seed).status === 0, "M09 fixture seed failed");
  const cookie = await login(email, password);

  const bytes = await jpegWithGpsExif();
  const sourceMetadata = await sharp(bytes).metadata();
  assert(Boolean(sourceMetadata.exif), "GPS EXIF fixture was not created");
  const payload = { treeId, filename: "synthetic-safe.jpg", mimeType: "image/jpeg", sizeBytes: bytes.length, sha256: sha256(bytes), purpose: "album", visibility: "restricted" };
  const intentKey = randomUUID();
  const intent = await jsonRequest(webUrl + "/api/v1/media/uploads", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": intentKey, Cookie: cookie }, body: JSON.stringify(payload) });
  assert(intent.response.status === 201 && intent.body?.data?.assetId && !intent.body.data.objectPath, "media upload intent did not return a redacted server URL");
  const assetId = intent.body.data.assetId;
  assetIds.push(assetId);
  const replay = await jsonRequest(webUrl + "/api/v1/media/uploads", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": intentKey, Cookie: cookie }, body: JSON.stringify(payload) });
  assert(replay.response.status === 201 && replay.body?.data?.assetId === assetId, "media intent idempotency replay failed");
  const uploaded = await fetch(intent.body.data.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg", "Content-Length": String(bytes.length), Cookie: cookie }, body: bytes });
  assert(uploaded.status === 200, "media binary upload failed (" + uploaded.status + ")");
  const finalizeKey = randomUUID();
  const finalized = await jsonRequest(webUrl + "/api/v1/media/" + assetId + "/finalize", { method: "POST", headers: { "Idempotency-Key": finalizeKey, Cookie: cookie }, body: "{}" });
  assert(finalized.response.status === 202 && finalized.body?.data?.state === "ready", "safe media did not become ready after scan");
  const finalizedReplay = await jsonRequest(webUrl + "/api/v1/media/" + assetId + "/finalize", { method: "POST", headers: { "Idempotency-Key": finalizeKey, Cookie: cookie }, body: "{}" });
  assert(finalizedReplay.response.status === 202 && finalizedReplay.body?.data?.state === "ready", "media finalize idempotency replay failed");
  const visible = await jsonRequest(webUrl + "/api/v1/media/" + assetId, { headers: { Cookie: cookie } });
  assert(visible.response.status === 200 && visible.body?.data?.state === "ready", "ready media projection failed");
  const access = await jsonRequest(webUrl + "/api/v1/media/" + assetId + "/access?variant=320", { method: "POST", headers: { Cookie: cookie } });
  assert(access.response.status === 200 && access.body?.data?.mode === "signed", "private derivative access did not return a signed URL");
  assert(!access.body.data.objectPath && Date.parse(access.body.data.expiresAt) > Date.now(), "signed media URL was not redacted or expired");
  const derivativeResponse = await fetch(access.body.data.url);
  assert(derivativeResponse.ok, "private derivative signed URL could not be downloaded");
  const derivativeMetadata = await sharp(Buffer.from(await derivativeResponse.arrayBuffer())).metadata();
  assert(!derivativeMetadata.exif, "derivative still contains EXIF metadata");
  const immutableAttempt = runPsql("update private.media_assets set actual_sha256 = repeat('0', 64) where id = " + sqlString(assetId) + ";");
  assert(immutableAttempt.status !== 0, "original checksum mutation was not rejected");

  const infected = pngBytes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");
  const infectedPayload = { treeId, filename: "synthetic-scan.png", mimeType: "image/png", sizeBytes: infected.length, sha256: sha256(infected), purpose: "album", visibility: "restricted" };
  const infectedIntent = await jsonRequest(webUrl + "/api/v1/media/uploads", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookie }, body: JSON.stringify(infectedPayload) });
  assert(infectedIntent.response.status === 201, "scan-failure intent was not created");
  const infectedId = infectedIntent.body.data.assetId;
  assetIds.push(infectedId);
  const infectedUpload = await fetch(infectedIntent.body.data.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", "Content-Length": String(infected.length), Cookie: cookie }, body: infected });
  assert(infectedUpload.status === 200, "scan-failure upload should remain pending for finalize");
  const infectedFinal = await jsonRequest(webUrl + "/api/v1/media/" + infectedId + "/finalize", { method: "POST", headers: { "Idempotency-Key": randomUUID(), Cookie: cookie }, body: "{}" });
  assert(infectedFinal.response.status === 202 && infectedFinal.body?.data?.state === "quarantined", "failed scan incorrectly became ready");
  console.log("PASS local M09-01/M09-02: private bucket intent, immutable original checksum, EXIF-free derivative, expiring signed URL, idempotency and failed scan quarantine");
} finally {
  for (const assetId of assetIds) {
    for (const path of ["original", "derivatives/320.webp", "derivatives/640.webp", "derivatives/1280.webp", "derivatives/1920.webp"]) {
      await fetch(env.API_URL + "/storage/v1/object/family-assets/" + userId + "/" + assetId + "/" + path, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY } });
    }
  }
  runPsql([
    "begin;",
    "delete from private.outbox where tree_id = " + sqlString(treeId) + ";",
    "delete from private.audit_events where tree_id = " + sqlString(treeId) + ";",
    "delete from private.idempotency_records where tree_id = " + sqlString(treeId) + ";",
    "delete from private.media_assets where tree_id = " + sqlString(treeId) + ";",
    "delete from private.capability_grants where tree_id = " + sqlString(treeId) + ";",
    "delete from private.memberships where tree_id = " + sqlString(treeId) + ";",
    "delete from private.trees where id = " + sqlString(treeId) + ";",
    "commit;"
  ].join("\n"));
  await deleteUser(env, userId);
}
