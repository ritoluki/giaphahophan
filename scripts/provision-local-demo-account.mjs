import { randomBytes, randomUUID } from "node:crypto";
import { access, open, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const projectId = "phan-gia-pha-local";
const containerName = "supabase_db_phan-gia-pha-local";
const loginOrigin = "http://127.0.0.1:3100";
const credentialFile = ".env.demo.local";
const credentialPath = path.resolve(credentialFile);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function readLocalSupabaseEnv() {
  const result = run(process.env.ComSpec || "cmd.exe", [
    "/d", "/s", "/c", "pnpm.cmd exec supabase status --output env",
  ]);
  assert(result.status === 0, "Supabase local status failed; start the local stack first.");

  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }

  const apiUrl = new URL(values.API_URL ?? "invalid:");
  const dbUrl = new URL(values.DB_URL ?? "invalid:");
  assert(apiUrl.protocol === "http:" && apiUrl.hostname === "127.0.0.1" && apiUrl.port === "54321",
    "Refusing to provision: Auth endpoint is not the expected local loopback.");
  assert(dbUrl.protocol === "postgresql:" && dbUrl.hostname === "127.0.0.1" && dbUrl.port === "54322",
    "Refusing to provision: database endpoint is not the expected local loopback.");
  assert(values.SERVICE_ROLE_KEY, "Supabase local Auth admin key is unavailable.");
  return { apiUrl: apiUrl.origin, serviceRoleKey: values.SERVICE_ROLE_KEY };
}

function runSql(sql) {
  const result = run("docker.exe", [
    "exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-f", "-",
  ], { input: sql });
  assert(result.status === 0, "Local demo-tree bootstrap failed; SQL details were suppressed.");
  return result.stdout;
}

async function createAuthUser(apiUrl, serviceRoleKey, email, password) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Chủ cây minh họa" },
    }),
  });
  const payload = await response.json().catch(() => null);
  assert(response.ok && typeof payload?.id === "string", `Local Auth account creation failed (HTTP ${response.status}).`);
  return payload.id;
}

async function deleteAuthUser(apiUrl, serviceRoleKey, userId) {
  if (!userId) return;
  await fetch(`${apiUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  }).catch(() => undefined);
}

async function loginSmoke(email, password) {
  const response = await fetch(`${loginOrigin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  assert(response.ok && body?.data?.authenticated === true, `Local BFF login smoke failed (HTTP ${response.status}).`);
}

const projectConfig = await readFile("supabase/config.toml", "utf8");
assert(projectConfig.includes(`project_id = "${projectId}"`), "Refusing to run outside the expected local Supabase project.");
assert(process.env.CI !== "true", "Local demo account provisioning is disabled in CI.");
let credentialsExist = false;
try {
  await access(credentialPath);
  credentialsExist = true;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
assert(!credentialsExist, `${credentialFile} already exists; refusing to overwrite local credentials.`);

const dbStatus = run("docker.exe", ["inspect", "--format", "{{.State.Running}}", containerName]);
assert(dbStatus.status === 0 && dbStatus.stdout.trim() === "true", "Expected local Supabase database container is not running.");

const { apiUrl, serviceRoleKey } = readLocalSupabaseEnv();
const treeId = randomUUID();
const branchId = randomUUID();
const requestId = randomUUID();
const suffix = randomBytes(8).toString("hex");
const email = `phan-demo-owner-${suffix}@example.test`;
const password = `Demo-${randomBytes(36).toString("base64url")}Aa9!`;
const slug = `phan-demo-owner-${suffix}`;
const credentialText = [
  "# Local-only synthetic demo credentials. Do not commit or share this file.",
  `DEMO_LOGIN_URL=${loginOrigin}/dang-nhap`,
  `DEMO_LOGIN_EMAIL=${email}`,
  `DEMO_LOGIN_PASSWORD=${password}`,
  "DEMO_LOGIN_ROLE=owner",
  "DEMO_SUPABASE_PROJECT=phan-gia-pha-local",
  "",
].join("\n");

let credentialHandle;
let credentialOwned = false;
let userId;
let treeCreated = false;
try {
  credentialHandle = await open(credentialPath, "wx", 0o600);
  credentialOwned = true;
  await credentialHandle.writeFile(credentialText, "utf8");
  await credentialHandle.close();
  credentialHandle = undefined;

  userId = await createAuthUser(apiUrl, serviceRoleKey, email, password);
  const sql = `
begin;
insert into private.trees (id, created_by, slug, name, data_mode)
values (${sqlLiteral(treeId)}, ${sqlLiteral(userId)}, ${sqlLiteral(slug)}, 'Phan Gia Phả · Bản demo', 'demo');
insert into private.branches (id, tree_id, created_by, code, name, visibility)
values (${sqlLiteral(branchId)}, ${sqlLiteral(treeId)}, ${sqlLiteral(userId)}, 'DEMO', 'Nhánh minh họa', 'restricted');
insert into private.memberships (tree_id, created_by, auth_user_id, role, status, approved_by)
values (${sqlLiteral(treeId)}, ${sqlLiteral(userId)}, ${sqlLiteral(userId)}, 'owner', 'active', null);
insert into private.audit_events (tree_id, actor_id, action, resource_kind, resource_id, request_id, redacted_summary)
values (${sqlLiteral(treeId)}, null, 'local.demo_owner.bootstrapped', 'tree', ${sqlLiteral(treeId)}, ${sqlLiteral(requestId)}, 'Local synthetic demo owner bootstrapped after explicit owner request');
commit;
`;
  runSql(sql);
  treeCreated = true;

  const verification = runSql(`
do $$
begin
  if not exists (
    select 1 from private.memberships
    where tree_id = ${sqlLiteral(treeId)} and auth_user_id = ${sqlLiteral(userId)}
      and role = 'owner' and status = 'active' and approved_by is null
  ) then raise exception 'local demo owner membership verification failed'; end if;
  if not exists (
    select 1 from private.trees where id = ${sqlLiteral(treeId)} and data_mode = 'demo'
  ) then raise exception 'local demo tree verification failed'; end if;
end $$;
select 'LOCAL_DEMO_OWNER_VERIFIED';
`);
  assert(verification.includes("LOCAL_DEMO_OWNER_VERIFIED"), "Local owner membership verification failed.");
  await loginSmoke(email, password);
} catch (error) {
  if (credentialHandle) await credentialHandle.close().catch(() => undefined);
  if (treeCreated && userId) {
    runSql(`
begin;
delete from private.audit_events where tree_id = ${sqlLiteral(treeId)};
delete from private.memberships where tree_id = ${sqlLiteral(treeId)} and auth_user_id = ${sqlLiteral(userId)};
delete from private.branches where tree_id = ${sqlLiteral(treeId)};
delete from private.trees where id = ${sqlLiteral(treeId)};
commit;
`);
  }
  await deleteAuthUser(apiUrl, serviceRoleKey, userId);
  if (credentialOwned) await rm(credentialPath, { force: true });
  throw error;
}

console.log("PASS: created and BFF-login-verified one synthetic local owner account.");
console.log(`Login URL: ${loginOrigin}/dang-nhap`);
console.log(`Credentials are stored (not printed) in ${credentialFile}; Git ignores this file.`);
console.log("Role: owner on one empty demo tree. Privileged actions require enrolling MFA.");
console.log("Independent review/two-person actions still require a separate account; this owner cannot approve its own changes.");
