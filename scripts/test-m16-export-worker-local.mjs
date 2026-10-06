import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const container = "supabase_db_phan-gia-pha-local";
process.env.APP_ENV = "test";
process.env.DATA_MODE = "demo";
const requireWorker = createRequire(resolve(root, "apps/worker/package.json"));
const { createClient } = requireWorker("@supabase/supabase-js");
const { processOneExport } = await import("../apps/worker/src/export-processor.ts");
const { SupabaseExportProcessingStore } = await import("../apps/worker/src/supabase-export-store.ts");

function assert(condition, message) { if (!condition) throw new Error(message); }
function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function loadLocalEnv() {
  const cli = resolve(root, "node_modules/.bin/supabase.cmd");
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", `${cli} status -o env`], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Supabase local status unavailable: ${result.stderr.trim() || "CLI exited non-zero"}`);
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET"]) {
    if (!values[key]) throw new Error("Supabase local status omitted a required local value");
  }
  return values;
}

function psql(statement) {
  return spawnSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: statement, encoding: "utf8", windowsHide: true,
  });
}

function signJwt(secret, claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  const signature = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${signature}`;
}

const env = loadLocalEnv();
const actorId = randomUUID();
const sessionId = randomUUID();
const treeId = randomUUID();
const membershipId = randomUUID();
const jobs = [
  { id: randomUUID(), dbFormat: "json", resultFormat: "canonical_json" },
  { id: randomUUID(), dbFormat: "pdf", resultFormat: "book_pdf" },
  { id: randomUUID(), dbFormat: "svg", resultFormat: "svg" },
];
const workerId = randomUUID();
const email = `m16-worker-${randomUUID()}@synthetic.test`;
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const userJwt = signJwt(env.JWT_SECRET, {
  aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000),
  iss: "supabase", sub: actorId, role: "authenticated", aal: "aal2", session_id: sessionId,
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
});
const userClient = createClient(env.API_URL, env.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${userJwt}` } },
});
const objectPaths = jobs.map(({ id, dbFormat }) => `${treeId}/${id}/primary.${dbFormat === "json" ? "json" : dbFormat}`);
let created = false;

try {
  const setup = psql(`
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-0000-0000-000000000000',${sql(actorId)},'authenticated','authenticated',${sql(email)},'',clock_timestamp(),clock_timestamp(),clock_timestamp(),'{}','{}');
insert into auth.sessions(id,user_id,aal) values(${sql(sessionId)},${sql(actorId)},'aal2');
insert into private.trees(id,slug,name,data_mode,created_by) values(${sql(treeId)},${sql(`m16-worker-${treeId}`)},'Synthetic Export Worker Tree','demo',${sql(actorId)});
insert into private.memberships(id,tree_id,auth_user_id,role,status,created_by,approved_by)
values(${sql(membershipId)},${sql(treeId)},${sql(actorId)},'owner','active',${sql(actorId)},${sql(actorId)});
insert into private.capability_grants(tree_id,membership_id,created_by,capability)
values(${sql(treeId)},${sql(membershipId)},${sql(actorId)},'exports.bulk');
select set_config('request.jwt.claim.sub',${sql(actorId)},true);
select set_config('request.jwt.claims',${sql(JSON.stringify({ sub: actorId, role: "authenticated", aal: "aal2", session_id: sessionId }))},true);
insert into private.export_jobs(id,tree_id,created_by,requested_by,purpose,format,scope,policy_version)
select fixtures.id,t.id,${sql(actorId)},${sql(actorId)},'Synthetic local worker E2E',fixtures.format,'{"kind":"tree"}'::jsonb,t.policy_version
from private.trees t cross join (values ${jobs.map((item) => `(${sql(item.id)}::uuid,${sql(item.dbFormat)}::text)`).join(",")}) fixtures(id,format)
where t.id=${sql(treeId)};
commit;
`);
  assert(setup.status === 0, "synthetic worker fixture setup failed");
  created = true;

  const store = new SupabaseExportProcessingStore(service);
  const completedJobs = new Map();
  for (let index = 0; index < jobs.length; index += 1) {
    const result = await processOneExport(store, workerId);
    assert(result.status === "completed" && result.artifactCount === 1, `local worker did not complete synthetic render (${result.status}${result.status === "failed" ? `:${result.errorCode}` : ""})`);
    completedJobs.set(result.jobId, result);
  }
  assert(jobs.every(({ id }) => completedJobs.has(id)), "local worker did not render the complete JSON/PDF/SVG fixture set");

  for (const [index, fixture] of jobs.entries()) {
    const path = objectPaths[index];
    const { data: manifest, error: manifestError } = await userClient.schema("api").rpc("export_download_manifest", { p_job_id: fixture.id });
    assert(!manifestError && Array.isArray(manifest?.files) && manifest.files.length === 1, "authenticated same-session download manifest denied");
    assert(manifest.files[0].objectPath === path, "download manifest did not match the job-scoped object path");
    const { data: downloaded, error: downloadError } = await userClient.storage.from("export-artifacts").download(path);
    assert(!downloadError && downloaded instanceof Blob, "user-session private Storage download failed");
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    assert(bytes.byteLength === manifest.files[0].sizeBytes && timingSafeEqual(Buffer.from(actualHash), Buffer.from(manifest.files[0].sha256)), "downloaded artifact size/hash did not match its committed manifest");
    if (fixture.resultFormat === "book_pdf") assert(bytes.subarray(0, 5).toString("ascii") === "%PDF-", "Chromium output is not a PDF");
    if (fixture.resultFormat === "svg") assert(bytes.toString("utf8", 0, 4) === "<svg", "chart output is not an SVG document");
    if (fixture.resultFormat === "canonical_json") assert(JSON.parse(bytes.toString("utf8")).schemaVersion === "phan-export/1", "JSON export payload schema mismatch");
  }

  const denied = await createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    .schema("api").rpc("export_worker_claim", { p_worker_id: randomUUID(), p_lease_seconds: 120 });
  assert(denied.error !== null, "anonymous client unexpectedly claimed an export job");
  console.log("PASS local M16 worker HTTP/Storage E2E: service-role RPC claim, authorized projection, private JSON/PDF/SVG renders and uploads, stored-manifest completion, exact-session download manifests, authenticated private-object byte/hash verification; anonymous worker RPC denied. Synthetic DB rows and objects cleaned up.");
} finally {
  await service.storage.from("export-artifacts").remove(objectPaths).catch(() => undefined);
  if (created) {
    const cleanup = psql(`begin;
delete from private.export_jobs where id in (${jobs.map(({ id }) => sql(id)).join(",")});
delete from private.outbox where tree_id=${sql(treeId)};
delete from private.audit_events where tree_id=${sql(treeId)};
delete from private.idempotency_records where tree_id=${sql(treeId)};
delete from private.capability_grants where tree_id=${sql(treeId)};
delete from private.memberships where tree_id=${sql(treeId)};
delete from private.trees where id=${sql(treeId)};
delete from auth.users where id=${sql(actorId)};
commit;`);
    if (cleanup.status !== 0) throw new Error("synthetic worker fixture cleanup failed");
  }
}
