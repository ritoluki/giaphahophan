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
  if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
    throw new Error("Supabase local status did not expose required local endpoints");
  }
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
    // Keep assertion errors redacted when an endpoint returns non-JSON.
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
  assert(result.response.ok && result.body && result.body.id, "local synthetic user creation failed (" + result.response.status + ")");
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
  assert(result.response.ok && result.body && result.body.data && result.body.data.authenticated === true, "BFF login failed (" + result.response.status + ")");
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
  const enrollment = await jsonRequest(webUrl + "/api/v1/auth/mfa/enroll", { method: "POST", headers: { Cookie: currentCookies } });
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
    body: JSON.stringify({ factorId, challengeId: challenge.body.data.challengeId, code: totpCode(enrollment.body.data.secret) })
  });
  currentCookies = mergeCookieHeader(currentCookies, verification.response);
  assert(verification.response.status === 200 && verification.body?.data?.aal === "aal2", "MFA verification did not promote the session to aal2");
  return currentCookies;
}
const env = localEnv();
const treeId = randomUUID();
const branchId = randomUUID();
const personId = randomUUID();
const childPersonId = randomUUID();
const sourceId = randomUUID();
const membershipA = randomUUID();
const membershipB = randomUUID();
const grantA = randomUUID();
const grantB = randomUUID();
const emailA = "core-a-" + randomUUID() + "@synthetic.test";
const emailB = "core-b-" + randomUUID() + "@synthetic.test";
const passwordA = "Synthetic!" + randomUUID();
const passwordB = "Synthetic!" + randomUUID();
let userA;
let userB;

try {
  userA = await createSyntheticUser(env, emailA, passwordA);
  userB = await createSyntheticUser(env, emailB, passwordB);

  const seed = [
    "begin;",
    "insert into private.trees (id, created_by, slug, name, data_mode) values (" + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString("auth-" + treeId) + ", 'Synthetic Auth Integration Tree', 'demo');",
    "insert into private.branches (id, tree_id, created_by, code, name) values (" + sqlString(branchId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'AUTH', 'Synthetic Auth Branch');",
    "insert into private.persons (id, tree_id, created_by, code, display_name, name_search, visibility, protected_minor) values (" + sqlString(personId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'AUTH-PERSON', 'Synthetic Auth Person', 'synthetic auth person', 'public', false), (" + sqlString(childPersonId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'AUTH-CHILD', 'Synthetic Auth Child', 'synthetic auth child', 'public', false);",
    "insert into private.sources (id, tree_id, created_by, title, kind, provenance) values (" + sqlString(sourceId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'Synthetic Auth Source', 'oral', 'Synthetic local test only');",
    "insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (" + sqlString(membershipA) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(userA) + ", 'editor', 'active'), (" + sqlString(membershipB) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(userB) + ", 'reviewer', 'active');",
    "insert into private.capability_grants (id, tree_id, created_by, membership_id, capability) values (" + sqlString(grantA) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(membershipA) + ", 'proposal.submit'), (" + sqlString(grantB) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(membershipB) + ", 'proposal.review');",
    "commit;"
  ].join("\n");
  const seeded = runPsql(seed);
  assert(seeded.status === 0, "synthetic auth fixture seed failed");

  const cookieA = await loginThroughBff(emailA, passwordA);
  let cookieB = await loginThroughBff(emailB, passwordB);
  const submitKey = randomUUID();
  const selfReviewKey = randomUUID();
  const reviewKey = randomUUID();
  const relationshipSubmitKey = randomUUID();
  const relationshipReviewKey = randomUUID();
  const cycleSubmitKey = randomUUID();
  const cycleReviewKey = randomUUID();
  const claimSubmitKey = randomUUID();
  const claimSelfReviewKey = randomUUID();
  const claimReviewKey = randomUUID();
  const correctionKey = randomUUID();
  const deletionKey = randomUUID();
  const deletionReviewKey = randomUUID();

  const missingKey = await jsonRequest(webUrl + "/api/v1/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({
      treeId,
      kind: "correction",
      reason: "Synthetic missing idempotency key",
      items: [{
        targetKind: "person",
        targetId: personId,
        baseVersion: 1,
        operation: "update",
        fieldChanges: { display_name: "Denied" },
        sourceIds: [sourceId]
      }]
    })
  });
  assert(missingKey.response.status === 428, "mutation without Idempotency-Key was accepted");
  const proposalPayload = {
    treeId,
    kind: "correction",
    reason: "Synthetic authenticated correction",
    branchId,
    baseSnapshot: { graphRevision: 1 },
    items: [{
      targetKind: "person",
      targetId: personId,
      baseVersion: 1,
      operation: "update",
      fieldChanges: { display_name: "Synthetic Auth Person Updated" },
      sourceIds: [sourceId]
    }]
  };

  const submitted = await jsonRequest(webUrl + "/api/v1/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": submitKey, Cookie: cookieA },
    body: JSON.stringify(proposalPayload)
  });
  assert(submitted.response.status === 201 && submitted.body && submitted.body.data && submitted.body.data.status === "submitted", "authenticated proposal submit failed");
  const proposalId = submitted.body.data.id;
  const proposalVersion = submitted.body.data.version;

  const replayedSubmit = await jsonRequest(webUrl + "/api/v1/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": submitKey, Cookie: cookieA },
    body: JSON.stringify(proposalPayload)
  });
  assert(replayedSubmit.response.status === 201 && replayedSubmit.body?.data?.id === proposalId, "same submit idempotency key did not replay the original result");

  const conflictingSubmit = await jsonRequest(webUrl + "/api/v1/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": submitKey, Cookie: cookieA },
    body: JSON.stringify({ ...proposalPayload, reason: "Synthetic changed request under same key" })
  });
  assert(conflictingSubmit.response.status === 409, "same submit idempotency key with a different body was accepted");

  const preMfaReview = await jsonRequest(webUrl + "/api/v1/proposals/" + proposalId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieB },
    body: JSON.stringify({ decision: "approve", reason: "Synthetic review must require MFA", baseVersion: proposalVersion, reviewedSnapshotHash: "synthetic-pre-mfa-hash" })
  });
  assert(preMfaReview.response.status === 403, "reviewer action bypassed the database MFA guard");
  cookieB = await setupSyntheticMfa(cookieB);
  const selfReview = await jsonRequest(webUrl + "/api/v1/proposals/" + proposalId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": selfReviewKey, Cookie: cookieA },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic self review must be denied",
      baseVersion: proposalVersion,
      reviewedSnapshotHash: "synthetic-hash"
    })
  });
  assert(selfReview.response.status === 403, "proposal author was allowed to review through BFF");

  const reviewed = await jsonRequest(webUrl + "/api/v1/proposals/" + proposalId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": reviewKey, Cookie: cookieB },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic independent review",
      baseVersion: proposalVersion,
      reviewedSnapshotHash: "synthetic-hash"
    })
  });
  assert(reviewed.response.status === 200 && reviewed.body && reviewed.body.data && reviewed.body.data.status === "approved", "independent review did not approve");

  const replayedReview = await jsonRequest(webUrl + "/api/v1/proposals/" + proposalId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": reviewKey, Cookie: cookieB },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic independent review",
      baseVersion: proposalVersion,
      reviewedSnapshotHash: "synthetic-hash"
    })
  });
  assert(replayedReview.response.status === 200 && replayedReview.body?.data?.id === proposalId && replayedReview.body?.data?.status === "approved", "same review idempotency key did not replay the original result");

  const verified = runPsql("select p.status, p.version, person.display_name, person.version, (select count(*) from private.audit_events where resource_id = p.id) as audit_count, (select count(*) from private.outbox where resource_id = p.id) as proposal_outbox_count, (select count(*) from private.outbox where resource_id = person.id and event_type = 'person.updated') as person_outbox_count from private.proposals p join private.persons person on person.id = " + sqlString(personId) + " and person.tree_id = p.tree_id where p.id = " + sqlString(proposalId) + ";");
  assert(verified.status === 0 && /approved\s+\|\s+2\s+\|\s+Synthetic Auth Person Updated\s+\|\s+2\s+\|\s+2\s+\|\s+2\s+\|\s+1/.test(verified.stdout), "proposal projection/audit/outbox verification failed");
  const approvedDiff = await jsonRequest(webUrl + "/api/v1/proposals/" + proposalId + "/diff", { headers: { Cookie: cookieA } });
  assert(approvedDiff.response.status === 200 && approvedDiff.body?.data?.items?.[0]?.isStale === true, "proposal diff did not expose the approved proposal as stale after canonical version advanced");

  const stalePayload = {
    treeId,
    kind: "correction",
    reason: "Synthetic stale correction",
    branchId,
    baseSnapshot: { person: { version: 2, display_name: "Synthetic Auth Person Updated" } },
    items: [{
      targetKind: "person",
      targetId: personId,
      baseVersion: 2,
      operation: "update",
      fieldChanges: { display_name: "Synthetic Stale Proposal" },
      sourceIds: [sourceId]
    }]
  };
  const staleSubmitted = await jsonRequest(webUrl + "/api/v1/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieA },
    body: JSON.stringify(stalePayload)
  });
  assert(staleSubmitted.response.status === 201 && staleSubmitted.body?.data?.status === "submitted", "stale proposal fixture was not submitted");
  const staleProposalId = staleSubmitted.body.data.id;
  const staleProposalVersion = staleSubmitted.body.data.version;
  const advanced = runPsql("update private.persons set display_name = 'Synthetic External Update' where id = " + sqlString(personId) + " and tree_id = " + sqlString(treeId) + ";");
  assert(advanced.status === 0, "external canonical update fixture failed");

  const staleDiff = await jsonRequest(webUrl + "/api/v1/proposals/" + staleProposalId + "/diff", { headers: { Cookie: cookieA } });
  assert(staleDiff.response.status === 200 && staleDiff.body?.data?.items?.[0]?.isStale === true, "proposal diff did not flag a stale current version");

  const staleReview = await jsonRequest(webUrl + "/api/v1/proposals/" + staleProposalId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieB },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic stale review must conflict",
      baseVersion: staleProposalVersion,
      reviewedSnapshotHash: "synthetic-stale-hash"
    })
  });
  assert(staleReview.response.status === 409, "stale review did not return 409");
  const staleCanonical = runPsql("select person.version, person.display_name, p.status from private.persons person join private.proposals p on p.id = " + sqlString(staleProposalId) + " where person.id = " + sqlString(personId) + ";");
  assert(staleCanonical.status === 0 && /3\s+\|\s+Synthetic External Update\s+\|\s+submitted/.test(staleCanonical.stdout), "stale review changed canonical data or proposal status");
  const relationshipPayload = {
    treeId,
    kind: "relationship",
    reason: "Synthetic authenticated parent link",
    branchId,
    baseSnapshot: { graphRevision: 1 },
    items: [{
      targetKind: "parent_link",
      operation: "create",
      fieldChanges: {
        parent_id: personId,
        child_id: childPersonId,
        kind: "biological",
        status: "confirmed",
        source_id: sourceId
      },
      sourceIds: [sourceId]
    }]
  };
  const relationshipSubmitted = await jsonRequest(webUrl + "/api/v1/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": relationshipSubmitKey, Cookie: cookieA },
    body: JSON.stringify(relationshipPayload)
  });
  assert(relationshipSubmitted.response.status === 201 && relationshipSubmitted.body?.data?.status === "submitted", "relationship proposal submit failed");
  const relationshipId = relationshipSubmitted.body.data.id;
  const relationshipVersion = relationshipSubmitted.body.data.version;
  const relationshipReviewed = await jsonRequest(webUrl + "/api/v1/proposals/" + relationshipId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": relationshipReviewKey, Cookie: cookieB },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic relationship approval",
      baseVersion: relationshipVersion,
      reviewedSnapshotHash: "synthetic-relationship-hash"
    })
  });
  assert(relationshipReviewed.response.status === 200 && relationshipReviewed.body?.data?.status === "approved", "relationship proposal did not approve");
  const relationshipVerified = runPsql("select count(*) from private.parent_links where tree_id = " + sqlString(treeId) + " and parent_id = " + sqlString(personId) + " and child_id = " + sqlString(childPersonId) + " and deleted_at is null;");
  assert(relationshipVerified.status === 0 && /\b1\b/.test(relationshipVerified.stdout), "approved relationship was not persisted");
  const kinship = await jsonRequest(webUrl + "/api/v1/kinship?from=" + personId + "&to=" + childPersonId, { headers: { Cookie: cookieA } });
  assert(kinship.response.status === 200 && kinship.body?.data?.status === "found", "kinship BFF projection failed");

  const cyclePayload = {
    ...relationshipPayload,
    reason: "Synthetic ancestry cycle",
    items: [{
      ...relationshipPayload.items[0],
      fieldChanges: {
        ...relationshipPayload.items[0].fieldChanges,
        parent_id: childPersonId,
        child_id: personId
      }
    }]
  };
  const cycleSubmitted = await jsonRequest(webUrl + "/api/v1/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": cycleSubmitKey, Cookie: cookieA },
    body: JSON.stringify(cyclePayload)
  });
  assert(cycleSubmitted.response.status === 201 && cycleSubmitted.body?.data?.status === "submitted", "cycle proposal submit failed");
  const cycleReviewed = await jsonRequest(webUrl + "/api/v1/proposals/" + cycleSubmitted.body.data.id + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": cycleReviewKey, Cookie: cookieB },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic cycle must be rejected",
      baseVersion: cycleSubmitted.body.data.version,
      reviewedSnapshotHash: "synthetic-cycle-hash"
    })
  });
  assert(cycleReviewed.response.status === 409, "ancestry cycle was accepted through BFF");

  const claimPayload = {
    treeId,
    personId: childPersonId,
    reason: "Synthetic account claim"
  };
  const claimSubmitted = await jsonRequest(webUrl + "/api/v1/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": claimSubmitKey, Cookie: cookieA },
    body: JSON.stringify(claimPayload)
  });
  assert(claimSubmitted.response.status === 201 && claimSubmitted.body?.data?.status === "pending", "claim submit through BFF failed (" + claimSubmitted.response.status + "): " + JSON.stringify(claimSubmitted.body));
  const claimId = claimSubmitted.body.data.id;
  const claimSelfReview = await jsonRequest(webUrl + "/api/v1/claims/" + claimId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": claimSelfReviewKey, Cookie: cookieA },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic claim self-review must be denied",
      baseVersion: claimSubmitted.body.data.version
    })
  });
  assert(claimSelfReview.response.status === 403, "claim requester was allowed to self-review through BFF");
  const claimReviewed = await jsonRequest(webUrl + "/api/v1/claims/" + claimId + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": claimReviewKey, Cookie: cookieB },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic independent claim approval",
      baseVersion: claimSubmitted.body.data.version
    })
  });
  assert(claimReviewed.response.status === 200 && claimReviewed.body?.data?.status === "approved", "independent claim review failed");
  const claimVerified = runPsql("select count(*) from private.memberships where id = " + sqlString(membershipA) + " and person_id = " + sqlString(childPersonId) + " and status = 'active';");
  assert(claimVerified.status === 0 && /\b1\b/.test(claimVerified.stdout), "approved claim did not link membership");
  const missingIfMatch = await jsonRequest(webUrl + "/api/v1/people/" + childPersonId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieA },
    body: JSON.stringify({ treeId, reason: "Synthetic missing If-Match", fieldChanges: { biography: "Denied" }, sourceIds: [sourceId] })
  });
  assert(missingIfMatch.response.status === 428, "person correction without If-Match was accepted");
  const correction = await jsonRequest(webUrl + "/api/v1/people/" + childPersonId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Idempotency-Key": correctionKey, "If-Match": "\"1\"", Cookie: cookieA },
    body: JSON.stringify({ treeId, reason: "Synthetic versioned correction", fieldChanges: { biography: "Synthetic proposed correction" }, sourceIds: [sourceId] })
  });
  assert(correction.response.status === 202 && correction.body?.data?.status === "submitted", "versioned person correction did not create a proposal");
  const deletionImpact = await jsonRequest(webUrl + "/api/v1/people/" + childPersonId + "/deletion-impact", {
    method: "GET",
    headers: { Cookie: cookieA }
  });
  assert(deletionImpact.response.status === 200 && deletionImpact.body?.data?.edgeCount === 1 && deletionImpact.body?.data?.sourceCount === 1, "deletion impact preview was not authorized or complete");
  const missingDeleteIfMatch = await jsonRequest(webUrl + "/api/v1/people/" + childPersonId, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID(), Cookie: cookieA },
    body: JSON.stringify({ treeId, reason: "Synthetic missing delete If-Match" })
  });
  assert(missingDeleteIfMatch.response.status === 428, "soft-delete without If-Match was accepted");
  const deletion = await jsonRequest(webUrl + "/api/v1/people/" + childPersonId, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "Idempotency-Key": deletionKey, "If-Match": "\"1\"", Cookie: cookieA },
    body: JSON.stringify({ treeId, reason: "Synthetic versioned soft-delete request" })
  });
  assert(deletion.response.status === 202 && deletion.body?.data?.status === "submitted", "soft-delete proposal was not submitted");
  const deletionReviewed = await jsonRequest(webUrl + "/api/v1/proposals/" + deletion.body.data.id + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": deletionReviewKey, Cookie: cookieB },
    body: JSON.stringify({
      decision: "approve",
      reason: "Synthetic independent soft-delete review",
      baseVersion: deletion.body.data.version,
      reviewedSnapshotHash: "synthetic-delete-hash"
    })
  });
  assert(deletionReviewed.response.status === 200 && deletionReviewed.body?.data?.status === "approved", "soft-delete proposal was not approved");
  const deletionVerified = runPsql("select (select count(*) from private.persons where id = " + sqlString(childPersonId) + " and deleted_at is not null) || '|' || (select count(*) from private.parent_links where tree_id = " + sqlString(treeId) + " and child_id = " + sqlString(childPersonId) + " and deleted_at is null) || '|' || (select count(*) from private.sources where id = " + sqlString(sourceId) + ");");
  assert(deletionVerified.status === 0 && /1\|0\|1/.test(deletionVerified.stdout), "soft-delete did not hide person/edge while retaining source");
  const mfaStatus = await jsonRequest(webUrl + "/api/v1/auth/mfa/status", { headers: { Cookie: cookieB } });
  assert(mfaStatus.response.status === 200 && mfaStatus.body?.data?.aal === "aal2" && mfaStatus.body?.data?.mfaEnrolled === true && mfaStatus.body?.data?.factorId, "MFA status did not expose the verified aal2 factor");
  const unenrolled = await jsonRequest(webUrl + "/api/v1/auth/mfa/unenroll", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ factorId: mfaStatus.body.data.factorId })
  });
  assert(unenrolled.response.status === 200 && unenrolled.body?.data?.mfaEnrolled === false, "MFA unenroll policy did not remove the verified factor");
  console.log("PASS local authenticated CORE-02/M03-04/M03-05/M03-06/M07-03/M08-02: BFF login, pre-MFA review denial, TOTP enroll/challenge/verify aal2, proposal review, stale diff projection, stale review 409 without overwrite, factor status/unenroll, claims, corrections, impact preview and soft-delete persistence");
} finally {
  const cleanup = [
    "begin;",
    "delete from private.outbox where tree_id = " + sqlString(treeId) + ";",
    "delete from private.audit_events where tree_id = " + sqlString(treeId) + ";",
    "delete from private.idempotency_records where tree_id = " + sqlString(treeId) + ";",
    "delete from private.person_claims where tree_id = " + sqlString(treeId) + ";",
    "delete from private.review_decisions where tree_id = " + sqlString(treeId) + ";",
    "delete from private.proposal_items where tree_id = " + sqlString(treeId) + ";",
    "delete from private.proposals where tree_id = " + sqlString(treeId) + ";",
    "delete from private.capability_grants where tree_id = " + sqlString(treeId) + ";",
    "delete from private.memberships where tree_id = " + sqlString(treeId) + ";",
    "delete from private.parent_links where tree_id = " + sqlString(treeId) + ";",
    "delete from private.person_names where tree_id = " + sqlString(treeId) + ";",
    "delete from private.persons where tree_id = " + sqlString(treeId) + ";",
    "delete from private.sources where tree_id = " + sqlString(treeId) + ";",
    "delete from private.branches where tree_id = " + sqlString(treeId) + ";",
    "delete from private.trees where id = " + sqlString(treeId) + ";",
    "commit;"
  ].join("\n");
  runPsql(cleanup);
  await deleteSyntheticUser(env, userA);
  await deleteSyntheticUser(env, userB);
}
