import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = "supabase_db_phan-gia-pha-local";
const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3100";

function localEnv() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local status missing required endpoints");
  return values;
}

function sqlString(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function runPsql(sql) {
  return spawnSync(
    "docker.exe",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: sql, encoding: "utf8", windowsHide: true }
  );
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Assertions below report the status without echoing response contents.
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createSyntheticUser(env, email, password) {
  const result = await jsonRequest(env.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  assert(result.response.ok && result.body?.id, "synthetic user creation failed (" + result.response.status + ")");
  return result.body.id;
}

async function deleteSyntheticUser(env, userId) {
  if (!userId) return;
  await fetch(env.API_URL + "/auth/v1/admin/users/" + userId, {
    method: "DELETE",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SERVICE_ROLE_KEY
    }
  });
}

async function loginThroughBff(email, password) {
  const result = await jsonRequest(webUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert(result.response.ok && result.body?.data?.authenticated === true, "BFF login failed (" + result.response.status + ")");
  const setCookies = result.response.headers.getSetCookie ? result.response.headers.getSetCookie() : [];
  const cookieHeader = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  assert(cookieHeader.length > 0, "BFF login did not issue a session cookie");
  return cookieHeader;
}

function mergeCookieHeader(current, response) {
  const values = new Map();
  for (const part of current.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) values.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const value of setCookies) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) values.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return [...values].map(([name, value]) => name + "=" + value).join("; ");
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of value.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Synthetic TOTP secret was invalid");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret, timestamp = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timestamp));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

async function setupSyntheticMfa(cookieHeader) {
  let currentCookies = cookieHeader;
  const enrollment = await jsonRequest(webUrl + "/api/v1/auth/mfa/enroll", {
    method: "POST",
    headers: { Cookie: currentCookies }
  });
  currentCookies = mergeCookieHeader(currentCookies, enrollment.response);
  assert(enrollment.response.status === 200 && enrollment.body?.data?.factorId && enrollment.body?.data?.secret, "MFA enrollment failed");
  const factorId = enrollment.body.data.factorId;
  const challenge = await jsonRequest(webUrl + "/api/v1/auth/mfa/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: currentCookies },
    body: JSON.stringify({ factorId })
  });
  currentCookies = mergeCookieHeader(currentCookies, challenge.response);
  assert(challenge.response.status === 200 && challenge.body?.data?.challengeId, "MFA challenge failed");
  const verification = await jsonRequest(webUrl + "/api/v1/auth/mfa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: currentCookies },
    body: JSON.stringify({
      factorId,
      challengeId: challenge.body.data.challengeId,
      code: totpCode(enrollment.body.data.secret)
    })
  });
  currentCookies = mergeCookieHeader(currentCookies, verification.response);
  assert(verification.response.status === 200 && verification.body?.data?.aal === "aal2", "MFA verification did not promote the session to aal2");
  return currentCookies;
}

const env = localEnv();
const treeId = randomUUID();
const branchId = randomUUID();
const ownerMembershipId = randomUUID();
const adminMembershipId = randomUUID();
const memberMembershipId = randomUUID();
const ownerEmail = "m07-owner-" + randomUUID() + "@synthetic.test";
const adminEmail = "m07-admin-" + randomUUID() + "@synthetic.test";
const memberEmail = "m07-member-" + randomUUID() + "@synthetic.test";
const ownerPassword = "Synthetic!" + randomUUID();
const adminPassword = "Synthetic!" + randomUUID();
const memberPassword = "Synthetic!" + randomUUID();
let ownerUser;
let adminUser;
let memberUser;

try {
  ownerUser = await createSyntheticUser(env, ownerEmail, ownerPassword);
  adminUser = await createSyntheticUser(env, adminEmail, adminPassword);
  memberUser = await createSyntheticUser(env, memberEmail, memberPassword);

  const seeded = runPsql([
    "begin;",
    "insert into private.trees (id, created_by, slug, name, data_mode) values (" + sqlString(treeId) + ", " + sqlString(ownerUser) + ", " + sqlString("m07-04-" + treeId) + ", 'Synthetic M07-04 Tree', 'demo');",
    "insert into private.branches (id, tree_id, created_by, code, name) values (" + sqlString(branchId) + ", " + sqlString(treeId) + ", " + sqlString(ownerUser) + ", 'M07', 'Synthetic M07-04 Branch');",
    "insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (" + sqlString(ownerMembershipId) + ", " + sqlString(treeId) + ", " + sqlString(ownerUser) + ", " + sqlString(ownerUser) + ", 'owner', 'active'), (" + sqlString(adminMembershipId) + ", " + sqlString(treeId) + ", " + sqlString(ownerUser) + ", " + sqlString(adminUser) + ", 'admin', 'active'), (" + sqlString(memberMembershipId) + ", " + sqlString(treeId) + ", " + sqlString(ownerUser) + ", " + sqlString(memberUser) + ", 'member', 'active');",
    "commit;"
  ].join("\n"));
  assert(seeded.status === 0, "synthetic M07-04 fixture seed failed");

  const ownerCookieBeforeMfa = await loginThroughBff(ownerEmail, ownerPassword);
  const adminCookie = await loginThroughBff(adminEmail, adminPassword);
  const memberCookie = await loginThroughBff(memberEmail, memberPassword);

  const memberList = await jsonRequest(webUrl + "/api/v1/members", { headers: { Cookie: memberCookie } });
  assert(memberList.response.status === 403, "non-admin membership list did not return 403");

  const ownerListBeforeMfa = await jsonRequest(webUrl + "/api/v1/members", { headers: { Cookie: ownerCookieBeforeMfa } });
  assert(ownerListBeforeMfa.response.status === 200 && ownerListBeforeMfa.body?.data?.length === 3, "owner membership list failed before MFA");
  const ownerBeforeMfa = ownerListBeforeMfa.body.data.find((item) => item.id === ownerMembershipId);
  assert(ownerBeforeMfa?.mfaEnrolled === false, "owner projection reported MFA enrolled before setup");

  const preMfaOwnerUpdate = await jsonRequest(webUrl + "/api/v1/members/" + memberMembershipId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": "1",
      "Idempotency-Key": randomUUID(),
      Cookie: ownerCookieBeforeMfa
    },
    body: JSON.stringify({ role: "reviewer", status: "active", reason: "Synthetic pre-MFA denial" })
  });
  assert(preMfaOwnerUpdate.response.status === 403, "owner membership mutation bypassed MFA");

  const preMfaAdminUpdate = await jsonRequest(webUrl + "/api/v1/members/" + memberMembershipId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": "1",
      "Idempotency-Key": randomUUID(),
      Cookie: adminCookie
    },
    body: JSON.stringify({ role: "reviewer", status: "active", reason: "Synthetic admin pre-MFA denial" })
  });
  assert(preMfaAdminUpdate.response.status === 403, "admin membership mutation bypassed MFA");

  const ownerCookie = await setupSyntheticMfa(ownerCookieBeforeMfa);
  const ownerListAfterMfa = await jsonRequest(webUrl + "/api/v1/members", { headers: { Cookie: ownerCookie } });
  assert(ownerListAfterMfa.response.status === 200, "owner membership list failed after MFA");
  const ownerAfterMfa = ownerListAfterMfa.body.data.find((item) => item.id === ownerMembershipId);
  assert(ownerAfterMfa?.mfaEnrolled === true, "owner projection did not report verified MFA");

  const updatePayload = { role: "reviewer", status: "suspended", reason: "Synthetic suspension with audit" };
  const updateKey = randomUUID();
  const updated = await jsonRequest(webUrl + "/api/v1/members/" + memberMembershipId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": "1",
      "Idempotency-Key": updateKey,
      Cookie: ownerCookie
    },
    body: JSON.stringify(updatePayload)
  });
  assert(updated.response.status === 200 && updated.body?.data?.role === "reviewer" && updated.body?.data?.status === "suspended" && updated.body?.data?.version === 2, "membership update failed");

  const replayedUpdate = await jsonRequest(webUrl + "/api/v1/members/" + memberMembershipId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": "1",
      "Idempotency-Key": updateKey,
      Cookie: ownerCookie
    },
    body: JSON.stringify(updatePayload)
  });
  assert(replayedUpdate.response.status === 200 && replayedUpdate.body?.data?.version === 2, "membership update idempotency replay failed");

  const conflictingUpdate = await jsonRequest(webUrl + "/api/v1/members/" + memberMembershipId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": "1",
      "Idempotency-Key": updateKey,
      Cookie: ownerCookie
    },
    body: JSON.stringify({ ...updatePayload, reason: "Synthetic conflicting request" })
  });
  assert(conflictingUpdate.response.status === 409, "membership update accepted changed payload under same key");

  const ownerTargetUpdate = await jsonRequest(webUrl + "/api/v1/members/" + ownerMembershipId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": "1",
      "Idempotency-Key": randomUUID(),
      Cookie: ownerCookie
    },
    body: JSON.stringify({ role: "admin", status: "active", reason: "Synthetic owner transfer bypass" })
  });
  assert(ownerTargetUpdate.response.status === 403, "owner membership was mutable outside transfer flow");

  const selfRoleUpdate = await jsonRequest(webUrl + "/api/v1/members/" + ownerMembershipId, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": "1",
      "Idempotency-Key": randomUUID(),
      Cookie: ownerCookie
    },
    body: JSON.stringify({ role: "member", status: "active", reason: "Synthetic self promotion boundary" })
  });
  assert(selfRoleUpdate.response.status === 403, "owner self-role mutation was accepted");

  const grantPayload = { capability: "operations.read", branchId: null, expiresAt: null };
  const grantKey = randomUUID();
  const grant = await jsonRequest(webUrl + "/api/v1/members/" + memberMembershipId + "/grants", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": grantKey,
      Cookie: ownerCookie
    },
    body: JSON.stringify(grantPayload)
  });
  assert(grant.response.status === 201 && grant.body?.data?.status === "active", "capability grant creation failed");

  const replayedGrant = await jsonRequest(webUrl + "/api/v1/members/" + memberMembershipId + "/grants", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": grantKey,
      Cookie: ownerCookie
    },
    body: JSON.stringify(grantPayload)
  });
  assert(replayedGrant.response.status === 201 && replayedGrant.body?.data?.id === grant.body.data.id, "capability grant idempotency replay failed");

  const memberListAfterUpdate = await jsonRequest(webUrl + "/api/v1/members", { headers: { Cookie: memberCookie } });
  assert(memberListAfterUpdate.response.status === 403, "suspended non-admin membership list did not remain restricted");

  const persisted = runPsql(
    "select (select count(*) from private.memberships where id = " + sqlString(memberMembershipId) + " and role = 'reviewer' and status = 'suspended' and version = 2) || '|' || " +
    "(select count(*) from private.capability_grants where membership_id = " + sqlString(memberMembershipId) + " and capability = 'operations.read' and revoked_at is null) || '|' || " +
    "(select count(*) from private.audit_events where tree_id = " + sqlString(treeId) + " and action = 'membership.updated') || '|' || " +
    "(select count(*) from private.audit_events where tree_id = " + sqlString(treeId) + " and action = 'membership.grant.created') || '|' || " +
    "(select count(*) from private.outbox where tree_id = " + sqlString(treeId) + " and event_type = 'membership.updated') || '|' || " +
    "(select count(*) from private.outbox where tree_id = " + sqlString(treeId) + " and event_type = 'membership.grant.created');"
  );
  assert(persisted.status === 0 && /1\|1\|1\|1\|1\|1/.test(persisted.stdout), "membership persistence/audit/outbox verification failed");

  console.log("PASS local M07-04: restricted membership list, MFA-gated owner/admin mutation, suspend, owner/self-role guards, idempotent grants, audit and outbox");
} finally {
  runPsql([
    "begin;",
    "delete from private.outbox where tree_id = " + sqlString(treeId) + ";",
    "delete from private.audit_events where tree_id = " + sqlString(treeId) + ";",
    "delete from private.idempotency_records where tree_id = " + sqlString(treeId) + ";",
    "delete from private.capability_grants where tree_id = " + sqlString(treeId) + ";",
    "delete from private.memberships where tree_id = " + sqlString(treeId) + ";",
    "delete from private.branches where tree_id = " + sqlString(treeId) + ";",
    "delete from private.trees where id = " + sqlString(treeId) + ";",
    "commit;"
  ].join("\n"));
  await deleteSyntheticUser(env, ownerUser);
  await deleteSyntheticUser(env, adminUser);
  await deleteSyntheticUser(env, memberUser);
}

