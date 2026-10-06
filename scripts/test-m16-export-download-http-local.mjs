import { randomUUID, createHmac } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbContainer = "supabase_db_phan-gia-pha-local";
process.env.APP_ENV = "test";
process.env.DATA_MODE = "demo";
const requireWorker = createRequire(resolve(root, "apps/worker/package.json"));
const { createClient } = requireWorker("@supabase/supabase-js");
const { processOneExport } = await import("../apps/worker/src/export-processor.ts");
const { SupabaseExportProcessingStore } = await import("../apps/worker/src/supabase-export-store.ts");

function assert(condition, message) { if (!condition) throw new Error(message); }
function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function localEnv() {
  const cli = resolve(root, "node_modules/.bin/supabase.cmd");
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", `${cli} status -o env`], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  if (result.status !== 0) throw new Error("Local Supabase status unavailable");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) if (!values[key]) throw new Error("Local Supabase omitted a required setting");
  return values;
}

function psql(statement, tuples = false) {
  const args = ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (tuples) args.push("-At");
  args.push("-f", "-");
  return spawnSync("docker.exe", args, { input: statement, encoding: "utf8", windowsHide: true });
}

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let buffer = 0, bits = 0;
  const bytes = [];
  for (const character of secret.toUpperCase().replaceAll("=", "")) {
    const value = alphabet.indexOf(character);
    assert(value >= 0, "Synthetic TOTP secret could not be decoded");
    buffer = (buffer << 5) | value; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function mergeCookies(current, response) {
  const pairs = new Map(current.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("="); return [part.slice(0, separator), part.slice(separator + 1)];
  }));
  for (const item of response.headers.getSetCookie?.() ?? []) {
    const pair = item.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator > 0) pairs.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return [...pairs].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, init);
  let body;
  try { body = await response.json(); } catch { throw new Error("Local BFF returned a non-JSON response"); }
  return { response, body };
}

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string", "Could not reserve a local test port");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

const env = localEnv();
assert(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.API_URL), "Refusing HTTP E2E unless Supabase is on loopback");
const pendingCount = psql("select count(*) from private.export_jobs where status in ('queued','running');", true);
assert(pendingCount.status === 0 && pendingCount.stdout.trim() === "0", "Local export queue is not empty; refusing to claim another user's queued work");

const port = await reservePort();
const origin = `http://localhost:${port}`;
const standaloneRoot = resolve(root, "apps/web/.next-m16-export-download-local/standalone/apps/web");
const serverPath = resolve(standaloneRoot, "server.js");
function hasCompiledLocalEndpoint(directory) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return false; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (hasCompiledLocalEndpoint(path)) return true;
    } else if (/\.(?:js|json)$/.test(entry.name)) {
      try { if (readFileSync(path, "utf8").includes(env.API_URL)) return true; } catch {}
    }
  }
  return false;
}
assert(
  hasCompiledLocalEndpoint(resolve(standaloneRoot, ".next-m16-export-download-local/server")),
  "Standalone build does not contain the loopback Supabase URL; rebuild it with local env before HTTP E2E"
);
const web = spawn(process.execPath, [serverPath], {
  cwd: dirname(serverPath), windowsHide: true, stdio: "ignore",
  env: { ...process.env, NODE_ENV: "production", APP_ENV: "test", DATA_MODE: "demo", PORT: String(port), HOSTNAME: "127.0.0.1",
    NEXT_PUBLIC_APP_URL: origin, NEXT_PUBLIC_SUPABASE_URL: env.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.ANON_KEY },
});

const treeId = randomUUID();
const membershipId = randomUUID();
const email = `m16-download-${randomUUID()}@synthetic.test`;
const password = `Synthetic!${randomUUID()}`;
let createdUser = false;
let seeded = false;
let cookie = "";
let jobId;
let objectPath;
let userId;
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (web.exitCode !== null) throw new Error("Standalone Next process exited before readiness");
    try {
      const response = await fetch(`${origin}/api/v1/health/live`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  assert(ready, "Standalone Next build did not become ready on the reserved loopback port");

  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user, "Synthetic local auth user creation failed");
  createdUser = true;
  userId = created.data.user.id;
  const directAuth = createClient(env.API_URL, env.ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const directLogin = await directAuth.auth.signInWithPassword({ email, password });
  assert(!directLogin.error, `Synthetic local password auth failed (${directLogin.error?.status ?? 0}:${directLogin.error?.code ?? "unknown"})`);

  const seed = psql(`begin;
insert into private.trees(id,slug,name,data_mode,created_by) values(${sql(treeId)},${sql(`m16-download-${treeId}`)},'Synthetic Export Download Tree','demo',${sql(userId)});
insert into private.memberships(id,tree_id,auth_user_id,role,status,created_by,approved_by) values(${sql(membershipId)},${sql(treeId)},${sql(userId)},'owner','active',${sql(userId)},${sql(userId)});
insert into private.capability_grants(tree_id,membership_id,created_by,capability) values(${sql(treeId)},${sql(membershipId)},${sql(userId)},'exports.bulk');
commit;`);
  assert(seed.status === 0, "Synthetic local export membership setup failed");
  seeded = true;

  let auth = await jsonRequest(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert(auth.response.ok && auth.body?.data?.authenticated, `Synthetic BFF login failed (${auth.response.status}:${auth.body?.data?.code ?? "unknown"})`);
  cookie = mergeCookies(cookie, auth.response);
  assert(cookie.length > 0, "Synthetic BFF login did not issue a cookie session");

  let enrolled = await jsonRequest(`${origin}/api/v1/auth/mfa/enroll`, { method: "POST", headers: { Cookie: cookie } });
  assert(enrolled.response.ok && enrolled.body?.data?.factorId && enrolled.body?.data?.secret, "Synthetic MFA enrollment failed");
  cookie = mergeCookies(cookie, enrolled.response);
  let challenge = await jsonRequest(`${origin}/api/v1/auth/mfa/challenge`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ factorId: enrolled.body.data.factorId }) });
  assert(challenge.response.ok && challenge.body?.data?.challengeId, "Synthetic MFA challenge failed");
  cookie = mergeCookies(cookie, challenge.response);
  const verified = await jsonRequest(`${origin}/api/v1/auth/mfa/verify`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ factorId: enrolled.body.data.factorId, challengeId: challenge.body.data.challengeId, code: totp(enrolled.body.data.secret) }) });
  assert(verified.response.ok && verified.body?.data?.aal === "aal2", "Synthetic BFF MFA verification failed");
  cookie = mergeCookies(cookie, verified.response);

  let context = await jsonRequest(`${origin}/api/v1/exports`, { headers: { Cookie: cookie } });
  assert(context.response.ok && /^[a-f0-9]{64}$/.test(context.body?.data?.csrfToken), "Authorized export context did not return a CSRF token");
  cookie = mergeCookies(cookie, context.response);
  assert(context.body.data.scopes.some((scope) => scope.treeId === treeId && scope.scope.kind === "tree"), "Synthetic tree is missing from authorized export scopes");
  const key = randomUUID();
  const queued = await jsonRequest(`${origin}/api/v1/exports`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": context.body.data.csrfToken, "Idempotency-Key": key }, body: JSON.stringify({ treeId, format: "book_pdf", scope: { kind: "tree" }, reason: "Synthetic BFF download verification", includeMedia: false, audience: "members" }) });
  assert(queued.response.status === 202 && queued.body?.data?.id, `Synthetic export job creation failed (${queued.response.status})`);
  jobId = queued.body.data.id;

  const processed = await processOneExport(new SupabaseExportProcessingStore(service), randomUUID());
  assert(processed.status === "completed" && processed.jobId === jobId && processed.artifactCount === 1, `Synthetic PDF worker did not complete requested job (${processed.status}${processed.status === "failed" ? `:${processed.errorCode}` : ""})`);
  objectPath = `${treeId}/${jobId}/primary.pdf`;

  const anonymous = await fetch(`${origin}/api/v1/exports/${jobId}/download`, { redirect: "manual" });
  assert(anonymous.status === 401, `Anonymous Next download must be 401, got ${anonymous.status}`);
  const badSelector = await fetch(`${origin}/api/v1/exports/${jobId}/download?file=sidecar`, { headers: { Cookie: cookie } });
  assert(badSelector.status === 404 && badSelector.headers.get("cache-control") === "private, no-store", "Unavailable sidecar did not fail closed with private no-store headers");

  const downloaded = await fetch(`${origin}/api/v1/exports/${jobId}/download?file=primary`, { headers: { Cookie: cookie } });
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  assert(downloaded.status === 200, `Authenticated Next download failed (${downloaded.status})`);
  assert(downloaded.headers.get("content-type") === "application/pdf" && downloaded.headers.get("x-content-type-options") === "nosniff", "Next download response MIME/security headers mismatch");
  assert(downloaded.headers.get("cache-control") === "private, no-store" && downloaded.headers.get("content-disposition")?.includes(`${jobId}-primary.pdf`), "Next download was cacheable or lacked attachment disposition");
  assert(bytes.subarray(0, 5).toString("ascii") === "%PDF-" && Number(downloaded.headers.get("content-length")) === bytes.byteLength, "Next BFF returned invalid PDF bytes or length");
  console.log("PASS local authenticated Next BFF download E2E: standalone production build, cookie login, synthetic MFA AAL2, CSRF-protected PDF job, local worker/private Storage, exact-session authenticated GET, MIME/no-store/attachment/nosniff/length and PDF signature; anonymous access 401 and unavailable sidecar 404. Synthetic user/tree/job/object cleaned up.");
} finally {
  if (objectPath) await service.storage.from("export-artifacts").remove([objectPath]).catch(() => undefined);
  if (jobId) {
    const removed = psql(`begin; delete from private.export_jobs where id=${sql(jobId)}; delete from private.outbox where tree_id=${sql(treeId)}; delete from private.audit_events where tree_id=${sql(treeId)}; delete from private.idempotency_records where tree_id=${sql(treeId)}; commit;`);
    if (removed.status !== 0) throw new Error("Synthetic export job cleanup failed");
  }
  if (seeded) {
    const removed = psql(`begin; delete from private.capability_grants where tree_id=${sql(treeId)}; delete from private.memberships where tree_id=${sql(treeId)}; delete from private.trees where id=${sql(treeId)}; commit;`);
    if (removed.status !== 0) throw new Error("Synthetic export tree cleanup failed");
  }
  if (createdUser) {
    if (!userId) throw new Error("Synthetic auth user ID was lost before cleanup");
    const deleted = await service.auth.admin.deleteUser(userId);
    if (deleted.error) throw new Error("Synthetic auth user cleanup failed");
  }
  if (web.exitCode === null) {
    web.kill();
    await Promise.race([once(web, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 5000))]);
  }
}
