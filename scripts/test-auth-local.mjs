import { randomUUID } from "node:crypto";
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
  const cookieB = await loginThroughBff(emailB, passwordB);
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
  assert(claimSubmitted.response.status === 201 && claimSubmitted.body?.data?.status === "pending", "claim submit through BFF failed");
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
  console.log("PASS local authenticated CORE-02/M03-04: BFF login, proposal/relationship review, claim approval and persistence");
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
