import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const container = "supabase_db_phan-gia-pha-local";
const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3123";

function localEnv() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local status is missing required values");
  return values;
}
function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function runPsql(sql, tuplesOnly = false) {
  const args = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-At");
  args.push("-f", "-");
  return spawnSync("docker.exe", args, { input: sql, encoding: "utf8", windowsHide: true });
}
async function request(url, init = {}) {
  const response = await fetch(url, init);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

const env = localEnv();
const treeId = randomUUID();
const membershipId = randomUUID();
const userEmail = `m16-${randomUUID()}@synthetic.test`;
const password = `Synthetic!${randomUUID()}`;
let userId;
const assetIds = [];
const jobIds = [];

try {
  const created = await request(`${env.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEmail, password, email_confirm: true }),
  });
  assert(created.response.ok && created.body?.id, "synthetic M16 user creation failed");
  userId = created.body.id;

  const seed = runPsql([
    "begin;",
    `insert into private.trees(id,created_by,slug,name,data_mode) values (${sqlString(treeId)},${sqlString(userId)},${sqlString(`m16-${treeId}`)},'Synthetic M16 HTTP','demo');`,
    `insert into private.memberships(id,tree_id,created_by,auth_user_id,role,status,approved_by) values (${sqlString(membershipId)},${sqlString(treeId)},${sqlString(userId)},${sqlString(userId)},'owner','active',${sqlString(userId)});`,
    `insert into private.capability_grants(tree_id,created_by,membership_id,capability) values (${sqlString(treeId)},${sqlString(userId)},${sqlString(membershipId)},'imports.manage'),(${sqlString(treeId)},${sqlString(userId)},${sqlString(membershipId)},'media.upload');`,
    "commit;",
  ].join("\n"));
  assert(seed.status === 0, "M16 synthetic tree/capability seed failed");

  const directLogin = await request(`${env.API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEmail, password }),
  });
  assert(directLogin.response.ok, `local Supabase password auth failed (${directLogin.response.status})`);

  const login = await request(`${webUrl}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: userEmail, password }),
  });
  assert(login.response.ok && login.body?.data?.authenticated, `BFF login failed for synthetic user (${login.response.status}, ${login.body?.data?.code ?? "no code"})`);
  const loginCookies = login.response.headers.getSetCookie();
  const cookie = loginCookies.map((value) => value.split(";", 1)[0]).join("; ");

  async function uploadAndImport({ filename, mimeType, bytes, format, mappingVersion, mapping, sourceNamespace }) {
    const intent = await request(`${webUrl}/api/v1/media/uploads`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ treeId, filename, mimeType, sizeBytes: bytes.length, sha256: sha256(bytes), purpose: "import", visibility: "restricted" }),
    });
    assert(intent.response.status === 201 && intent.body?.data?.assetId, `private ${format} upload intent failed (${intent.response.status})`);
    const assetId = intent.body.data.assetId;
    assetIds.push(assetId);

    const uploaded = await fetch(intent.body.data.uploadUrl, { method: "PUT", headers: { ...intent.body.data.requiredHeaders, Cookie: cookie }, body: bytes });
    assert(uploaded.ok, `private ${format} upload failed (${uploaded.status})`);
    const finalized = await request(`${webUrl}/api/v1/media/${assetId}/finalize`, { method: "POST", headers: { Cookie: cookie, "Idempotency-Key": randomUUID(), "Content-Type": "application/json" }, body: "{}" });
    assert(finalized.response.status === 202 && finalized.body?.data?.state === "ready", `private ${format} source did not finalize (${finalized.response.status})`);

    const imported = await request(`${webUrl}/api/v1/imports`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ treeId, assetId, format, sourceNamespace, mappingVersion, mapping, mode: "demo" }),
    });
    assert(imported.response.status === 202 && imported.body?.data?.id, `${format} BFF dry-run failed (${imported.response.status}): ${imported.body?.data?.code ?? "no code"}`);
    const jobId = imported.body.data.id;
    jobIds.push(jobId);
    const preview = await request(`${webUrl}/api/v1/imports/${jobId}/preview`, { headers: { Cookie: cookie } });
    assert(preview.response.ok && preview.body?.data?.jobId === jobId, `${format} durable preview failed (${preview.response.status})`);
    assert(preview.body.data.fileSha256 === sha256(bytes) && preview.body.data.sampleRows.length === 1, `${format} preview checksum/sample did not match`);
    assert(preview.body.data.classification === "structured", `${format} classification was not structured`);
    return { assetId, jobId };
  }

  const jsonBytes = Buffer.from(JSON.stringify([{ id: "SYN-P1", name: "Fictional An", birth: "khoảng 1940" }]), "utf8");
  const jsonJob = await uploadAndImport({
    filename: "synthetic-family.json", mimeType: "application/json", bytes: jsonBytes, format: "canonical_json",
    sourceNamespace: "synthetic-m16", mappingVersion: "structured-json/1",
    mapping: { mappingVersion: "structured-json/1", sourceNamespace: "synthetic-m16", dateInterpretation: "explicit_only", columns: { id: "externalId", name: "displayName", birth: "birthDate" } },
  });
  const csvBytes = Buffer.from('id,name,birth\nSYN-P2,"Fictional Bình",03/04/1942\n', "utf8");
  const csvJob = await uploadAndImport({
    filename: "synthetic-family.csv", mimeType: "text/csv", bytes: csvBytes, format: "csv",
    sourceNamespace: "synthetic-m16", mappingVersion: "structured-csv/1",
    mapping: { mappingVersion: "structured-csv/1", sourceNamespace: "synthetic-m16", dateInterpretation: "explicit_only", columns: { id: "externalId", name: "displayName", birth: "birthDate" } },
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(loginCookies.map((header) => {
      const pair = header.split(";", 1)[0] ?? "";
      const delimiter = pair.indexOf("=");
      return {
        name: pair.slice(0, delimiter), value: pair.slice(delimiter + 1), url: webUrl,
        httpOnly: /;\s*httponly/i.test(header), secure: /;\s*secure/i.test(header), sameSite: /;\s*samesite=strict/i.test(header) ? "Strict" : /;\s*samesite=none/i.test(header) ? "None" : "Lax",
      };
    }).filter((item) => item.name.length > 0));
    const page = await context.newPage();
    await page.goto(`${webUrl}/quan-tri/nhap-lieu`);
    const treeSelect = page.getByLabel("Cây gia phả được cấp quyền");
    await treeSelect.waitFor({ state: "visible" });
    await page.waitForFunction((id) => Array.from(document.querySelectorAll("#import-tree option")).some((option) => option.value === id), treeId);
    await treeSelect.selectOption(treeId);
    await page.getByLabel("Định dạng").selectOption("csv");
    await page.getByLabel("Tiêu đề cột mã nguồn").fill("id");
    await page.getByLabel("Tiêu đề cột họ tên").fill("name");
    await page.getByLabel("Tiêu đề cột ngày sinh (không bắt buộc)").fill("birth");
    await page.getByLabel("Cách diễn giải ngày mơ hồ").selectOption("explicit_only");
    const browserCsv = Buffer.from('id,name,birth\nSYN-P3,"Fictional Gia đình",1941\n', "utf8");
    await page.locator("#import-file").setInputFiles({ name: "synthetic-browser.csv", mimeType: "text/csv", buffer: browserCsv });
    const uploadIntentPromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/media/uploads") && response.request().method() === "POST");
    const importPromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/imports") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Tải lên và chạy dry-run" }).click();
    const uploadIntent = await uploadIntentPromise;
    const uploadIntentBody = await uploadIntent.json();
    if (typeof uploadIntentBody?.data?.assetId === "string") assetIds.push(uploadIntentBody.data.assetId);
    const browserImport = await importPromise;
    assert(browserImport.status() === 202, `authenticated browser import failed (${browserImport.status()})`);
    const browserJob = await browserImport.json();
    if (typeof browserJob?.data?.id === "string") jobIds.push(browserJob.data.id);
    await page.getByRole("heading", { name: "Kết quả dry-run" }).waitFor({ state: "visible", timeout: 15_000 });
    assert((await page.locator(".import-result").innerText()).includes("Fictional Gia đình"), "browser did not render the persisted mapped preview row");
    await context.close();
  } finally {
    await browser.close();
  }

  for (const [job, expectedPrecision] of [[jsonJob, "about"], [csvJob, "unknown"]]) {
    const proof = runPsql(`select ((r.normalized #>> '{birthDate,precision}')=${sqlString(expectedPrecision)} and j.mapping_snapshot->>'mappingVersion'=j.mapping_version) from private.import_jobs j join private.import_rows r on r.job_id=j.id where j.id=${sqlString(job.jobId)};`, true);
    assert(proof.status === 0 && proof.stdout.trim() === "t", "persisted date precision or mapping snapshot did not match the dry-run");
  }

  console.log("PASS local M16 authenticated browser/HTTP: synthetic BFF login, private JSON+CSV upload/finalize, checksum-verified mapped dry-run, immutable mapping snapshot, date precision and capability-scoped persisted preview");
} finally {
  if (treeId) {
    for (const assetId of assetIds) {
      for (const path of [`${userId}/${assetId}/original`]) {
        await fetch(`${env.API_URL}/storage/v1/object/family-assets/${path}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
      }
    }
    const cleanup = runPsql([
      "begin;",
      `delete from private.import_rows where job_id in (${jobIds.length ? jobIds.map(sqlString).join(",") : "null"});`,
      `delete from private.import_jobs where tree_id=${sqlString(treeId)};`,
      `delete from private.outbox where tree_id=${sqlString(treeId)};`,
      `delete from private.audit_events where tree_id=${sqlString(treeId)};`,
      `delete from private.idempotency_records where tree_id=${sqlString(treeId)};`,
      `delete from private.media_assets where tree_id=${sqlString(treeId)};`,
      `delete from private.capability_grants where tree_id=${sqlString(treeId)};`,
      `delete from private.memberships where tree_id=${sqlString(treeId)};`,
      `delete from private.trees where id=${sqlString(treeId)};`,
      "commit;",
    ].join("\n"));
    if (cleanup.status !== 0) process.stderr.write("Synthetic M16 HTTP fixture cleanup failed\n");
  }
  if (userId) await fetch(`${env.API_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
}
