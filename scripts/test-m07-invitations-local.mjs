import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = "supabase_db_phan-gia-pha-local";
const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3118";

function localEnv() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local status missing required endpoints");
  return values;
}

function sqlString(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runPsql(sql) {
  return spawnSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8", windowsHide: true });
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  let body = null;
  try { body = await response.json(); } catch { /* assertion below reports status only */ }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createSyntheticUser(env, email, password) {
  const result = await jsonRequest(env.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  assert(result.response.ok && result.body?.id, "synthetic user creation failed (" + result.response.status + ")");
  return result.body.id;
}

async function deleteSyntheticUser(env, userId) {
  if (!userId) return;
  await fetch(env.API_URL + "/auth/v1/admin/users/" + userId, {
    method: "DELETE",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY }
  });
}

async function loginThroughBff(email, password) {
  const result = await jsonRequest(webUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert(result.response.ok && result.body?.data?.authenticated === true, "BFF login failed (" + result.response.status + ")");
  const cookies = result.response.headers.getSetCookie ? result.response.headers.getSetCookie() : [];
  const cookieHeader = cookies.map((value) => value.split(";", 1)[0]).join("; ");
  assert(cookieHeader.length > 0, "BFF login did not issue a session cookie");
  return cookieHeader;
}

const env = localEnv();
const treeId = randomUUID();
const branchId = randomUUID();
const membershipA = randomUUID();
const invitationId = randomUUID();
const knownInvitationId = randomUUID();
const expiredInvitationId = randomUUID();
const emailA = "m07-owner-" + randomUUID() + "@synthetic.test";
const emailB = "m07-member-" + randomUUID() + "@synthetic.test";
const passwordA = "Synthetic!" + randomUUID();
const passwordB = "Synthetic!" + randomUUID();
const knownToken = "M07-single-use-token-" + randomUUID() + "-synthetic";
const expiredToken = "M07-expired-token-" + randomUUID() + "-synthetic";
let userA;
let userB;

try {
  userA = await createSyntheticUser(env, emailA, passwordA);
  userB = await createSyntheticUser(env, emailB, passwordB);

  const seed = [
    "begin;",
    "insert into private.trees (id, created_by, slug, name, data_mode) values (" + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString("m07-" + treeId) + ", 'Synthetic M07 Invitation Tree', 'demo');",
    "insert into private.branches (id, tree_id, created_by, code, name) values (" + sqlString(branchId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'M07', 'Synthetic M07 Branch');",
    "insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (" + sqlString(membershipA) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(userA) + ", 'owner', 'active');",
    "insert into private.invitations (id, tree_id, created_by, email_hash, token_hash, intended_role, branch_id, expires_at) values (" + sqlString(knownInvitationId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(sha256(emailB.toLowerCase())) + ", " + sqlString(sha256(knownToken)) + ", 'member', " + sqlString(branchId) + ", clock_timestamp() + interval '7 days'), (" + sqlString(expiredInvitationId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(sha256(emailB.toLowerCase())) + ", " + sqlString(sha256(expiredToken)) + ", 'member', " + sqlString(branchId) + ", clock_timestamp() + interval '1 day');",
    "update private.invitations set created_at = clock_timestamp() - interval '2 days', expires_at = clock_timestamp() - interval '1 minute' where id = " + sqlString(expiredInvitationId) + ";",
    "commit;"
  ].join("\n");
  const seeded = runPsql(seed);
  assert(seeded.status === 0, "synthetic M07 fixture seed failed");

  const cookieA = await loginThroughBff(emailA, passwordA);
  const cookieB = await loginThroughBff(emailB, passwordB);
  const createPayload = { treeId, email: emailB, role: "member", branchId };
  const createKey = randomUUID();
  const created = await jsonRequest(webUrl + "/api/v1/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": createKey, Cookie: cookieA },
    body: JSON.stringify(createPayload)
  });
  assert(created.response.status === 201 && created.body?.data?.status === "queued", "invitation create did not queue (" + created.response.status + ")");
  assert(created.body.data.id !== invitationId && !JSON.stringify(created.body).includes(emailB), "invitation create leaked raw email or fixture secret");
  const createdId = created.body.data.id;
  const replayed = await jsonRequest(webUrl + "/api/v1/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": createKey, Cookie: cookieA },
    body: JSON.stringify(createPayload)
  });
  assert(replayed.response.status === 201 && replayed.body?.data?.id === createdId, "invitation create idempotency replay failed");
  const conflicting = await jsonRequest(webUrl + "/api/v1/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": createKey, Cookie: cookieA },
    body: JSON.stringify({ ...createPayload, role: "reviewer" })
  });
  assert(conflicting.response.status === 409, "invitation create accepted changed payload under same key");
  const queued = runPsql("select count(*) from private.outbox where resource_id = " + sqlString(createdId) + " and event_type = 'invitation.created';");
  assert(queued.status === 0 && /\b1\b/.test(queued.stdout), "invitation create did not enqueue one outbox event");

  const wrongUser = await jsonRequest(webUrl + "/api/v1/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieA },
    body: JSON.stringify({ token: knownToken })
  });
  assert(wrongUser.response.status === 404, "invitation accepted for an account with the wrong email");

  const expired = await jsonRequest(webUrl + "/api/v1/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieB },
    body: JSON.stringify({ token: expiredToken })
  });
  assert(expired.response.status === 404, "expired invitation was accepted");

  const acceptKey = randomUUID();
  const accepted = await jsonRequest(webUrl + "/api/v1/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": acceptKey, Cookie: cookieB },
    body: JSON.stringify({ token: knownToken })
  });
  assert(accepted.response.status === 200 && accepted.body?.data?.status === "pending", "matching invitation was not accepted into pending membership (" + accepted.response.status + ")");
  assert(!JSON.stringify(accepted.body).includes(knownToken), "accept response leaked raw token");
  const acceptedReplay = await jsonRequest(webUrl + "/api/v1/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": acceptKey, Cookie: cookieB },
    body: JSON.stringify({ token: knownToken })
  });
  assert(acceptedReplay.response.status === 200 && acceptedReplay.body?.data?.id === accepted.body.data.id, "invitation accept idempotency replay failed");
  const acceptConflict = await jsonRequest(webUrl + "/api/v1/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": acceptKey, Cookie: cookieB },
    body: JSON.stringify({ token: expiredToken })
  });
  assert(acceptConflict.response.status === 409, "invitation accept accepted changed token under same key");

  const persisted = runPsql("select (select count(*) from private.invitations where id = " + sqlString(knownInvitationId) + " and accepted_at is not null and token_hash = " + sqlString(sha256(knownToken)) + ") || '|' || (select count(*) from private.memberships where tree_id = " + sqlString(treeId) + " and auth_user_id = " + sqlString(userB) + " and role = 'member' and status = 'pending') || '|' || (select count(*) from private.capability_grants g join private.memberships m on m.id = g.membership_id where m.tree_id = " + sqlString(treeId) + " and m.auth_user_id = " + sqlString(userB) + ") || '|' || (select has_function_privilege('authenticated', 'api.invitation_accept(text)', 'execute')::int);");
  assert(persisted.status === 0 && /1\|1\|0\|0/.test(persisted.stdout), "invitation persistence or direct-wrapper revocation verification failed");
  const secondUse = await jsonRequest(webUrl + "/api/v1/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieB },
    body: JSON.stringify({ token: knownToken })
  });
  assert(secondUse.response.status === 404, "single-use invitation was accepted twice");

  console.log("PASS local M07-01: invitation queue/idempotency, hashed token, seven-day/expired TTL, email binding, single-use acceptance and pending membership");
} finally {
  runPsql([
    "begin;",
    "delete from private.outbox where tree_id = " + sqlString(treeId) + ";",
    "delete from private.audit_events where tree_id = " + sqlString(treeId) + ";",
    "delete from private.idempotency_records where tree_id = " + sqlString(treeId) + ";",
    "delete from private.invitations where tree_id = " + sqlString(treeId) + ";",
    "delete from private.memberships where tree_id = " + sqlString(treeId) + ";",
    "delete from private.branches where tree_id = " + sqlString(treeId) + ";",
    "delete from private.trees where id = " + sqlString(treeId) + ";",
    "commit;"
  ].join("\n"));
  await deleteSyntheticUser(env, userA);
  await deleteSyntheticUser(env, userB);
}