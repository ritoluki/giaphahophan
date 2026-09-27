import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const container = "supabase_db_phan-gia-pha-local";
function sqlString(value) {
  const quote = String.fromCharCode(39);
  return quote + String(value).replaceAll(quote, quote + quote) + quote;
}
function runPsql(sql) {
  return spawnSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], { input: sql, encoding: "utf8", windowsHide: true });
}
function runPsqlConcurrent(sql) {
  return new Promise((resolve) => {
    const child = spawn("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const userA = randomUUID();
const userB = randomUUID();
const treeId = randomUUID();
const branchId = randomUUID();
const sourceId = randomUUID();
const personA = randomUUID();
const personB = randomUUID();
const membershipA = randomUUID();
const membershipB = randomUUID();
const grantA = randomUUID();
const grantB = randomUUID();
const emailA = `m04-cycle-a-${userA}@synthetic.test`;
const emailB = `m04-cycle-b-${userB}@synthetic.test`;

const seed = [
  "begin;",
  `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000000', ${sqlString(userA)}, 'authenticated', 'authenticated', ${sqlString(emailA)}, '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'), ('00000000-0000-0000-0000-000000000000', ${sqlString(userB)}, 'authenticated', 'authenticated', ${sqlString(emailB)}, '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');`,
  `insert into private.trees (id, created_by, slug, name, data_mode) values (${sqlString(treeId)}, ${sqlString(userA)}, ${sqlString(`m04-cycle-${treeId}`)}, 'Synthetic M04 Cycle Tree', 'demo');`,
  `insert into private.branches (id, tree_id, created_by, code, name) values (${sqlString(branchId)}, ${sqlString(treeId)}, ${sqlString(userA)}, 'M04C', 'Synthetic Cycle Branch');`,
  `insert into private.persons (id, tree_id, created_by, code, display_name, name_search, visibility, protected_minor) values (${sqlString(personA)}, ${sqlString(treeId)}, ${sqlString(userA)}, 'M04-A', 'Synthetic Cycle A', 'synthetic cycle a', 'public', false), (${sqlString(personB)}, ${sqlString(treeId)}, ${sqlString(userA)}, 'M04-B', 'Synthetic Cycle B', 'synthetic cycle b', 'public', false);`,
  `insert into private.sources (id, tree_id, created_by, title, kind, provenance) values (${sqlString(sourceId)}, ${sqlString(treeId)}, ${sqlString(userA)}, 'Synthetic Cycle Source', 'oral', 'Synthetic local concurrency test only');`,
  `insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (${sqlString(membershipA)}, ${sqlString(treeId)}, ${sqlString(userA)}, ${sqlString(userA)}, 'editor', 'active'), (${sqlString(membershipB)}, ${sqlString(treeId)}, ${sqlString(userA)}, ${sqlString(userB)}, 'reviewer', 'active');`,
  `insert into private.capability_grants (id, tree_id, created_by, membership_id, capability) values (${sqlString(grantA)}, ${sqlString(treeId)}, ${sqlString(userA)}, ${sqlString(membershipA)}, 'proposal.submit'), (${sqlString(grantB)}, ${sqlString(treeId)}, ${sqlString(userA)}, ${sqlString(membershipB)}, 'proposal.review');`,
  "commit;"
].join("\n");
const cleanup = [
  "begin;",
  `delete from private.outbox where tree_id = ${sqlString(treeId)};`,
  `delete from private.audit_events where tree_id = ${sqlString(treeId)};`,
  `delete from private.review_decisions where tree_id = ${sqlString(treeId)};`,
  `delete from private.proposal_items where tree_id = ${sqlString(treeId)};`,
  `delete from private.proposals where tree_id = ${sqlString(treeId)};`,
  `delete from private.capability_grants where tree_id = ${sqlString(treeId)};`,
  `delete from private.memberships where tree_id = ${sqlString(treeId)};`,
  `delete from private.person_names where tree_id = ${sqlString(treeId)};`,
  `delete from private.parent_links where tree_id = ${sqlString(treeId)};`,
  `delete from private.persons where tree_id = ${sqlString(treeId)};`,
  `delete from private.sources where tree_id = ${sqlString(treeId)};`,
  `delete from private.branches where tree_id = ${sqlString(treeId)};`,
  `delete from private.idempotency_records where tree_id = ${sqlString(treeId)};`,
  `delete from private.trees where id = ${sqlString(treeId)};`,
  `delete from auth.users where id in (${sqlString(userA)}, ${sqlString(userB)});`,
  "commit;"
].join("\n");
function proposalItems(parentId, childId) {
  return JSON.stringify([{ target_kind: "parent_link", operation: "create", field_changes: { parent_id: parentId, child_id: childId, kind: "biological", status: "confirmed", source_id: sourceId }, source_ids: [sourceId] }]);
}
try {
  const seeded = runPsql(seed);
  assert(seeded.status === 0, `cycle concurrency seed failed: ${seeded.stderr}`);
  const submitSql = (items, key, hash) => [
    "begin;", "set local role authenticated;", `select set_config('request.jwt.claim.sub', ${sqlString(userA)}, true);`,
    `select id::text || '|' || version::text from api.proposal_submit_idempotent(${sqlString(treeId)}, 'relationship', 'Synthetic concurrent cycle proposal', ${sqlString(branchId)}, '{"graphRevision":1}'::jsonb, ${sqlString(items)}::jsonb, ${sqlString(key)}, ${sqlString(hash)});`,
    "commit;"
  ].join("\n");
  const submitA = runPsql(submitSql(proposalItems(personA, personB), randomUUID(), "m04-cycle-a-hash"));
  const submitB = runPsql(submitSql(proposalItems(personB, personA), randomUUID(), "m04-cycle-b-hash"));
  assert(submitA.status === 0 && submitB.status === 0, "cycle proposal submit failed");
  const proposalIdA = submitA.stdout.trim().split(/\r?\n/).find((line) => /^[0-9a-f-]{36}\|1$/i.test(line))?.split("|")?.[0];
  const proposalIdB = submitB.stdout.trim().split(/\r?\n/).find((line) => /^[0-9a-f-]{36}\|1$/i.test(line))?.split("|")?.[0];
  assert(proposalIdA && proposalIdB, `cycle proposal IDs invalid: ${submitA.stdout} ${submitB.stdout}`);
  const reviewSql = (proposalId, label) => [
    "begin;", "set local role authenticated;", `select set_config('request.jwt.claim.sub', ${sqlString(userB)}, true);`,
    "do $$", "begin", "  begin",
    `    perform api.proposal_review(${sqlString(proposalId)}::uuid, 'approve', ${sqlString(`Synthetic ${label} cycle review`)}, 1, ${sqlString(`m04-cycle-${label}-review`)});`,
    `    raise notice 'CYCLE_RACE=${label}_winner';`, "  exception when check_violation then", `    raise notice 'CYCLE_RACE=${label}_cycle_reject';`,
    "  end;", "end;", "$$;", "commit;"
  ].join("\n");
  const results = await Promise.all([runPsqlConcurrent(reviewSql(proposalIdA, "a")), runPsqlConcurrent(reviewSql(proposalIdB, "b"))]);
  const combinedOutput = results.map((result) => `${result.stdout}\n${result.stderr}`).join("\n");
  assert(results.every((result) => result.status === 0), `cycle concurrent review transaction failed: ${combinedOutput}`);
  assert((combinedOutput.match(/CYCLE_RACE=[ab]_winner/g) || []).length === 1, `cycle race did not produce exactly one winner: ${combinedOutput}`);
  assert((combinedOutput.match(/CYCLE_RACE=[ab]_cycle_reject/g) || []).length === 1, `cycle race did not produce exactly one cycle reject: ${combinedOutput}`);
  const verified = runPsql([`select (select count(*) from private.parent_links where tree_id = ${sqlString(treeId)} and deleted_at is null),`, `  (select count(*) from private.proposals where tree_id = ${sqlString(treeId)} and status = 'approved'),`, `  (select count(*) from private.proposals where tree_id = ${sqlString(treeId)} and status = 'submitted');`].join("\n"));
  assert(verified.status === 0 && /^1\|1\|1\s*$/m.test(verified.stdout), `cycle race persisted invalid state: ${verified.stdout}`);
  console.log("PASS local M04-05: concurrent inverse parent mutations serialize; one winner, one cycle rejection, one canonical edge");
} finally {
  const cleaned = runPsql(cleanup);
  if (cleaned.status !== 0) process.stderr.write(cleaned.stderr || "cycle concurrency fixture cleanup failed\n");
}