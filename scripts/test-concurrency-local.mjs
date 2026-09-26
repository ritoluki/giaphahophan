import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const container = 'supabase_db_phan-gia-pha-local';

function sqlString(value) {
  const quote = String.fromCharCode(39);
  return quote + String(value).replaceAll(quote, quote + quote) + quote;
}

function runPsql(sql, extraArgs = []) {
  return spawnSync(
    'docker.exe',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', ...extraArgs, '-f', '-'],
    { input: sql, encoding: 'utf8', windowsHide: true }
  );
}

function runPsqlConcurrent(sql) {
  return new Promise((resolve) => {
    const child = spawn(
      'docker.exe',
      ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', '-f', '-'],
      { windowsHide: true }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const userA = randomUUID();
const userB = randomUUID();
const treeId = randomUUID();
const branchId = randomUUID();
const personId = randomUUID();
const sourceId = randomUUID();
const membershipA = randomUUID();
const membershipB = randomUUID();
const grantA = randomUUID();
const grantB = randomUUID();
const emailA = 'concurrency-a-' + userA + '@synthetic.test';
const emailB = 'concurrency-b-' + userB + '@synthetic.test';

const seed = [
  'begin;',
  "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000000', " + sqlString(userA) + ", 'authenticated', 'authenticated', " + sqlString(emailA) + ", '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}'), ('00000000-0000-0000-0000-000000000000', " + sqlString(userB) + ", 'authenticated', 'authenticated', " + sqlString(emailB) + ", '', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}', '{}');",
  "insert into private.trees (id, created_by, slug, name, data_mode) values (" + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString('concurrency-' + treeId) + ", 'Synthetic Concurrency Tree', 'demo');",
  "insert into private.branches (id, tree_id, created_by, code, name) values (" + sqlString(branchId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'RACE', 'Synthetic Race Branch');",
  "insert into private.persons (id, tree_id, created_by, code, display_name, name_search, visibility, protected_minor) values (" + sqlString(personId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'RACE-PERSON', 'Synthetic Race Person', 'synthetic race person', 'public', false);",
  "insert into private.sources (id, tree_id, created_by, title, kind, provenance) values (" + sqlString(sourceId) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", 'Synthetic Race Source', 'oral', 'Synthetic local concurrency test only');",
  "insert into private.memberships (id, tree_id, created_by, auth_user_id, role, status) values (" + sqlString(membershipA) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(userA) + ", 'editor', 'active'), (" + sqlString(membershipB) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(userB) + ", 'reviewer', 'active');",
  "insert into private.capability_grants (id, tree_id, created_by, membership_id, capability) values (" + sqlString(grantA) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(membershipA) + ", 'proposal.submit'), (" + sqlString(grantB) + ", " + sqlString(treeId) + ", " + sqlString(userA) + ", " + sqlString(membershipB) + ", 'proposal.review');",
  'commit;'
].join('\n');

const cleanup = [
  'begin;',
  "delete from private.outbox where tree_id = " + sqlString(treeId) + ';',
  "delete from private.audit_events where tree_id = " + sqlString(treeId) + ';',
  "delete from private.review_decisions where tree_id = " + sqlString(treeId) + ';',
  "delete from private.proposal_items where tree_id = " + sqlString(treeId) + ';',
  "delete from private.proposals where tree_id = " + sqlString(treeId) + ';',
  "delete from private.capability_grants where tree_id = " + sqlString(treeId) + ';',
  "delete from private.memberships where tree_id = " + sqlString(treeId) + ';',
  "delete from private.person_names where tree_id = " + sqlString(treeId) + ';',
  "delete from private.persons where tree_id = " + sqlString(treeId) + ';',
  "delete from private.sources where tree_id = " + sqlString(treeId) + ';',
  "delete from private.branches where tree_id = " + sqlString(treeId) + ';',
  "delete from private.trees where id = " + sqlString(treeId) + ';',
  "delete from auth.users where id in (" + sqlString(userA) + ', ' + sqlString(userB) + ');',
  'commit;'
].join('\n');

try {
  const seeded = runPsql(seed);
  assert(seeded.status === 0, 'concurrency fixture seed failed');

  const proposalItems = JSON.stringify([{
    target_kind: 'person',
    target_id: personId,
    base_version: 1,
    operation: 'update',
    field_changes: { display_name: 'Synthetic Concurrent Winner' },
    source_ids: [sourceId]
  }]);
  const submit = runPsql([
    'begin;',
    'set local role authenticated;',
    "select set_config('request.jwt.claim.sub', " + sqlString(userA) + ', true);',
    "select id::text || '|' || version::text from api.proposal_submit(" + sqlString(treeId) + ", 'correction', 'Synthetic concurrent review', " + sqlString(branchId) + ", " + sqlString(JSON.stringify({ graphRevision: 1 })) + '::jsonb, ' + sqlString(proposalItems) + '::jsonb);',
    'commit;'
  ].join('\n'));
  assert(submit.status === 0, 'concurrency proposal submit failed');
  const submittedLine = submit.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => /^[0-9a-f-]{36}\|1$/i.test(line));
  const submitted = submittedLine?.split('|');
  assert(submitted?.[0] && submitted?.[1] === '1', 'concurrency proposal result was invalid: status=' + submit.status + ' stdout=' + JSON.stringify(submit.stdout) + ' stderr=' + JSON.stringify(submit.stderr));
  const proposalId = submitted[0];

  const reviewSql = [
    'begin;',
    'set local role authenticated;',
    "select set_config('request.jwt.claim.sub', " + sqlString(userB) + ', true);',
    'select pg_sleep(0.5);',
    'do $$',
    'begin',
    '  begin',
    '    perform api.proposal_review(' + sqlString(proposalId) + '::uuid, \'approve\', \'Synthetic concurrent approval\', 1, \'synthetic-concurrent-hash\');',
    '    raise notice \'RACE_RESULT=winner\';',
    '  exception when sqlstate \'P0009\' then',
    '    raise notice \'RACE_RESULT=conflict\';',
    '  end;',
    'end;',
    '$$;',
    'commit;'
  ].join('\n');
  const results = await Promise.all([runPsqlConcurrent(reviewSql), runPsqlConcurrent(reviewSql)]);
  const combinedOutput = results.map((result) => result.stdout + '\n' + result.stderr).join('\n');
  assert(results.every((result) => result.status === 0), 'concurrent review transaction failed');
  assert((combinedOutput.match(/RACE_RESULT=winner/g) || []).length === 1, 'concurrency did not produce exactly one winner');
  assert((combinedOutput.match(/RACE_RESULT=conflict/g) || []).length === 1, 'concurrency did not produce exactly one stale conflict');

  const verified = runPsql([
    'select p.status, p.version, person.display_name, person.version,',
    "  (select count(*) from private.review_decisions where proposal_id = p.id),",
    "  (select count(*) from private.outbox where resource_id = person.id and event_type = 'person.updated')",
    'from private.proposals p',
    'join private.persons person on person.id = ' + sqlString(personId) + ' and person.tree_id = p.tree_id',
    'where p.id = ' + sqlString(proposalId) + ';'
  ].join('\n'));
  assert(verified.status === 0 && /approved\|2\|Synthetic Concurrent Winner\|2\|1\|1/.test(verified.stdout), 'concurrent review applied an invalid final state');
  console.log('PASS local concurrency: one review winner, one stale conflict and one canonical projection');
} finally {
  const cleaned = runPsql(cleanup);
  if (cleaned.status !== 0) process.stderr.write(cleaned.stderr || 'concurrency fixture cleanup failed\n');
}
