import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const ids = { tree: randomUUID(), owner: randomUUID(), reviewer: randomUUID(), asset: randomUUID() };
const args = ["exec", "-i", "supabase_db_phan-gia-pha-local", "psql", "-U", "postgres", "-d", "postgres",
  "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At", "-f", "-"];
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const claims = (actor) => `select set_config('request.jwt.claim.sub',${quote(actor)},true);
  select set_config('request.jwt.claims',${quote(JSON.stringify({ sub: actor, role: "authenticated", aal: "aal2" }))},true);
  set local role authenticated;`;
function run(sql) {
  return spawnSync("docker.exe", args, { input: sql, encoding: "utf8", windowsHide: true });
}
function assert(ok, message) { if (!ok) throw new Error(message); }
function launch(sql, hold = false) {
  const child = spawn("docker.exe", args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "", signal;
  const acquired = new Promise((resolve) => { signal = resolve; });
  const timeout = setTimeout(() => child.kill(), 15000);
  const finished = new Promise((resolve, reject) => {
    child.stdout.on("data", (data) => { stdout += data.toString(); if (stdout.includes("LOCK_HELD")) signal(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", (status) => { clearTimeout(timeout); signal(); resolve({ status, stdout, stderr }); });
  });
  child.stdin.end(`begin; set local statement_timeout='10s'; ${claims(ids.owner)} ${sql}
    ${hold ? "select 'LOCK_HELD'; select pg_sleep(1);" : ""} commit;`);
  return { acquired, finished };
}
async function race(first, second) {
  const a = launch(first, true);
  await a.acquired;
  const b = launch(second);
  const results = await Promise.all([a.finished, b.finished]);
  assert(results[0].stdout.includes("LOCK_HELD"), "first transaction did not reach the locked checkpoint");
  return results;
}

try {
  const setup = run(`begin;
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
      values ('00000000-0000-0000-0000-000000000000',${quote(ids.owner)},'authenticated','authenticated',${quote("m16-race-"+ids.owner+"@synthetic.test")},'',now(),now(),now(),'{}','{}'),
      ('00000000-0000-0000-0000-000000000000',${quote(ids.reviewer)},'authenticated','authenticated',${quote("m16-race-"+ids.reviewer+"@synthetic.test")},'',now(),now(),now(),'{}','{}');
    insert into private.trees(id,created_by,slug,name,data_mode) values(${quote(ids.tree)},${quote(ids.owner)},${quote("m16-race-"+ids.tree)},'Synthetic M16 race fixture','demo');
    insert into private.memberships(tree_id,created_by,auth_user_id,role,status,approved_by) values
      (${quote(ids.tree)},${quote(ids.owner)},${quote(ids.owner)},'owner','active',${quote(ids.owner)}),
      (${quote(ids.tree)},${quote(ids.owner)},${quote(ids.reviewer)},'owner','active',${quote(ids.owner)});
    insert into private.media_assets(id,tree_id,created_by,filename,declared_mime,mime_type,size_bytes,actual_size_bytes,expected_sha256,actual_sha256,purpose,visibility,state,object_path)
      values(${quote(ids.asset)},${quote(ids.tree)},${quote(ids.owner)},'synthetic-race.json','application/json','application/json',128,128,repeat('a',64),repeat('a',64),
      'import','restricted','ready',${quote("synthetic/m16/race/"+ids.asset)});
    ${claims(ids.owner)}
    select * from api.import_create(${quote(ids.tree)},${quote(ids.asset)},'canonical_json','synthetic-race','chunks/race','demo',${quote(randomUUID())},repeat('b',64)) \\gset job_
    select * from api.import_stage_rows(:'job_id'::uuid,
      (select jsonb_agg(jsonb_build_object('rowNumber',n,'externalId','race-'||n,'rawPayload',jsonb_build_object('demo',true),
      'normalized',jsonb_build_object('externalId','race-'||n,'displayName','Hư cấu race '||n),'status','valid','errors','[]'::jsonb))
      from generate_series(1,1001) n),'[]'::jsonb) \\gset stage_
    reset role; ${claims(ids.reviewer)}
    select 'STATE='||api.import_approve(:'job_id'::uuid,:'stage_version'::bigint,:'stage_snapshot_hash',${quote(randomUUID())},repeat('c',64))::text;
    commit;`);
  assert(setup.status === 0, "synthetic race setup failed: " + setup.stderr);
  const approved = JSON.parse(setup.stdout.split(/\r?\n/).find((line) => line.startsWith("STATE=")).slice(6));
  const jobId = approved.job.id, base = approved.job.version, approval = approved.approvalId, snapshot = approved.approvedSnapshotHash;
  const firstKey = randomUUID();
  const chunk = (sequence, version, key) => `select api.import_chunk_apply(${quote(jobId)},${version},${quote(snapshot)},${quote(approval)},${sequence},${quote(key)},repeat('d',64));`;
  const cancel = (version) => `select api.import_cancel(${quote(jobId)},${version},'Synthetic concurrency cancellation',${quote(randomUUID())},repeat('e',64));`;
  const replayRace = await race(chunk(1, base, firstKey), chunk(1, base, firstKey));
  assert(replayRace.every((r) => r.status === 0), "simultaneous exact chunk replay failed");
  const stateAfterReplay = run(`begin; ${claims(ids.owner)} select 'STATE='||api.import_job_state(${quote(jobId)})::text; commit;`);
  const first = JSON.parse(stateAfterReplay.stdout.split(/\r?\n/).find((line) => line.startsWith("STATE=")).slice(6));
  assert(first.appliedPeople === 500 && first.chunkProgress.committed === 1, "concurrent replay duplicated canonical rows");
  const applyWins = await race(chunk(2, first.job.version, randomUUID()), cancel(first.job.version));
  assert(applyWins[0].status === 0 && applyWins[1].status !== 0 && applyWins[1].stderr.includes("40001"), "cancel did not recheck the version after waiting for apply");
  const secondVersion = first.job.version + 1;
  const cancelWins = await race(cancel(secondVersion), chunk(3, secondVersion, randomUUID()));
  assert(cancelWins[0].status === 0 && cancelWins[1].status !== 0 && cancelWins[1].stderr.includes("40001"), "apply continued after waiting for cancellation");
  const proof = run(`select (select status='cancelled' and manifest->>'appliedPeople'='1000' from private.import_jobs where id=${quote(jobId)})
    and (select count(*) from private.import_chunks where job_id=${quote(jobId)} and status='completed')=2
    and (select count(*) from private.persons where tree_id=${quote(ids.tree)})=1000
    and (select count(*) from private.sources where tree_id=${quote(ids.tree)})=1;`);
  assert(proof.status === 0 && proof.stdout.trim() === "t", "race outcome did not retain exactly two committed chunks");
  const jobVersion = secondVersion + 1;
  const requested = run(`begin; ${claims(ids.owner)} select 'STATE='||api.import_compensation(${quote(jobId)},'request',${jobVersion},
    null,null,'Synthetic compensation race',${quote(randomUUID())},repeat('a',64))::text; commit;`);
  assert(requested.status === 0, "compensation race request failed: " + requested.stderr);
  const review = JSON.parse(requested.stdout.split(/\r?\n/).find((line) => line.startsWith("STATE=")).slice(6)).compensation;
  const approvedUndo = run(`begin; ${claims(ids.reviewer)} select api.import_compensation(${quote(jobId)},'approve',${jobVersion},
    ${quote(review.id)},1,null,${quote(randomUUID())},repeat('b',64)); commit;`);
  assert(approvedUndo.status === 0, "compensation race approval failed: " + approvedUndo.stderr);
  const person = run(`select entity_id from private.import_owned_rows where job_id=${quote(jobId)} and table_name='persons' order by entity_id limit 1;`).stdout.trim();
  const aliasId = randomUUID();
  // Only the generated fixture uses privileged insertion to model a concurrent, FK-checked canonical writer.
  const aliasInsert = `reset role; insert into private.person_names(id,tree_id,created_by,person_id,name,name_search,kind,is_preferred)
    values(${quote(aliasId)},${quote(ids.tree)},${quote(ids.owner)},${quote(person)},'Synthetic new alias','synthetic new alias','alias',false);`;
  const undoKey = randomUUID();
  const undo = `select api.import_compensation(${quote(jobId)},'commit',${jobVersion},${quote(review.id)},2,null,${quote(undoKey)},repeat('c',64));`;
  const referenceWins = await race(aliasInsert, undo);
  assert(referenceWins[0].status === 0 && referenceWins[1].status !== 0 && referenceWins[1].stderr.includes("40001"),
    "compensation removed a reference committed while waiting for its write locks");
  const removeAlias = run(`delete from private.person_names where id=${quote(aliasId)} and tree_id=${quote(ids.tree)};`);
  assert(removeAlias.status === 0, "synthetic alias cleanup failed");
  const undoWins = await race(undo, aliasInsert);
  assert(undoWins[0].status === 0 && undoWins[1].status !== 0 && undoWins[1].stderr.includes("23503"),
    "concurrent reference insertion bypassed compensation transaction exclusion/FK checking");
  const undoProof = run(`select (select count(*) from private.persons where tree_id=${quote(ids.tree)})=0
    and (select count(*) from private.import_rows where job_id=${quote(jobId)})=1001
    and exists(select 1 from private.media_assets where id=${quote(ids.asset)})
    and (select status='completed' from private.import_compensation_requests where id=${quote(review.id)});`);
  assert(undoProof.status === 0 && undoProof.stdout.trim() === "t", "compensation race lost original staging/source or left canonical people");
  console.log("PASS local M16 concurrency: exact replay,apply/cancel in both orders,compensation/new-reference in both orders;conflicts preserve changes,successful undo retains original staging/source. Synthetic fixture cleanup follows.");
} finally {
  const cleanup = run(`begin;
    delete from private.import_jobs where tree_id=${quote(ids.tree)};
    delete from private.outbox where tree_id=${quote(ids.tree)};
    delete from private.audit_events where tree_id=${quote(ids.tree)};
    delete from private.idempotency_records where tree_id=${quote(ids.tree)};
    delete from private.citations where tree_id=${quote(ids.tree)};
    delete from private.parent_links where tree_id=${quote(ids.tree)};
    delete from private.union_partners where tree_id=${quote(ids.tree)};
    delete from private.union_children where tree_id=${quote(ids.tree)};
    delete from private.unions where tree_id=${quote(ids.tree)};
    delete from private.person_facts where tree_id=${quote(ids.tree)};
    delete from private.person_names where tree_id=${quote(ids.tree)};
    delete from private.external_id_map where tree_id=${quote(ids.tree)};
    delete from private.persons where tree_id=${quote(ids.tree)};
    delete from private.sources where tree_id=${quote(ids.tree)};
    delete from private.media_assets where tree_id=${quote(ids.tree)};
    delete from private.capability_grants where tree_id=${quote(ids.tree)};
    delete from private.memberships where tree_id=${quote(ids.tree)};
    delete from private.trees where id=${quote(ids.tree)};
    delete from auth.users where id in(${quote(ids.owner)},${quote(ids.reviewer)});
    commit;`);
  assert(cleanup.status === 0, "synthetic race cleanup failed: " + cleanup.stderr);
  console.log("PASS synthetic race fixture cleanup");
}
