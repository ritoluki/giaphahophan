import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const container = "supabase_db_phan-gia-pha-local";
const webUrl = process.env.TEST_WEB_URL || "http://localhost:3123";

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
    assert(preview.body.data.fileSha256 === sha256(bytes) && preview.body.data.sampleRows.length >= 1, `${format} preview checksum/sample did not match`);
    assert(preview.body.data.classification === (format.startsWith("gedcom") ? "gedcom" : "structured"), `${format} classification did not match`);
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
  const gedcomBytes = Buffer.from("0 HEAD\n1 SOUR SyntheticFixture\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Fictional An /Nguyen/\n1 BIRT\n2 DATE ABT 1940\n0 @F1@ FAM\n1 CHIL @I1@\n1 _PHAN_LUNAR_DATE 12/03/Canh Ty\n0 TRLR\n", "utf8");
  const gedcomJob = await uploadAndImport({
    filename: "synthetic-family.ged", mimeType: "text/plain", bytes: gedcomBytes, format: "gedcom_551",
    sourceNamespace: "synthetic-m16", mappingVersion: "gedcom-subset/1",
  });
  const stableMapBefore = runPsql(`select string_agg(external_id||':'||entity_kind||':'||canonical_id::text,',' order by external_id) from private.external_id_map where tree_id=${sqlString(treeId)} and source_namespace='synthetic-m16' and external_id in ('I1','F1') and entity_kind in ('person','family');`, true);
  assert(stableMapBefore.status === 0 && stableMapBefore.stdout.trim().split(",").length === 2, `GEDCOM person/family external IDs did not receive distinct stable UUID reservations (${stableMapBefore.stdout.trim() || "no map rows"})`);
  const gedcomReplay = await request(`${webUrl}/api/v1/imports`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ treeId, assetId: gedcomJob.assetId, format: "gedcom_551", sourceNamespace: "synthetic-m16", mappingVersion: "gedcom-subset/1", mode: "demo" }),
  });
  assert(gedcomReplay.response.status === 202 && gedcomReplay.body?.data?.id === gedcomJob.jobId, "same source/tree/mapping with a new idempotency key did not reuse its staging job");
  const replayProof = runPsql(`select ((select count(*) from private.import_jobs where tree_id=${sqlString(treeId)} and file_sha256=${sqlString(sha256(gedcomBytes))} and mapping_version='gedcom-subset/1')=1 and (select count(*) from private.import_rows where job_id=${sqlString(gedcomJob.jobId)})=2 and (select count(*) from private.audit_events where tree_id=${sqlString(treeId)} and action='import.created' and resource_id=${sqlString(gedcomJob.jobId)})=1);`, true);
  assert(replayProof.status === 0 && replayProof.stdout.trim() === "t", "content-key replay duplicated jobs, rows, or create audit events");
  const stableMapAfter = runPsql(`select string_agg(external_id||':'||entity_kind||':'||canonical_id::text,',' order by external_id) from private.external_id_map where tree_id=${sqlString(treeId)} and source_namespace='synthetic-m16' and external_id in ('I1','F1') and entity_kind in ('person','family');`, true);
  assert(stableMapAfter.status === 0 && stableMapAfter.stdout.trim() === stableMapBefore.stdout.trim(), "content-key replay changed the stable canonical UUID reservations");
  const gedcomProof = runPsql(`select (j.classification='gedcom' and j.format='gedcom_551' and r.normalized #>> '{birthDate,precision}'='about' and r.raw_payload->'gedcom' is not null) from private.import_jobs j join private.import_rows r on r.job_id=j.id where j.id=${sqlString(gedcomJob.jobId)} and r.row_number=1;`, true);
  assert(gedcomProof.status === 0 && gedcomProof.stdout.trim() === "t", "GEDCOM format, date precision, or raw source preservation did not persist");
  const relationshipReviewProof = runPsql(`select (count(*)=2 and bool_and(r.status='review' and r.errors @> '["relationship_mapping_requires_review"]'::jsonb)) from private.import_rows r where r.job_id=${sqlString(gedcomJob.jobId)};`, true);
  assert(relationshipReviewProof.status === 0 && relationshipReviewProof.stdout.trim() === "t", "GEDCOM relationship source and target records were not both persisted as review-only");
  const gedcom7Bytes = Buffer.from("0 HEAD\n1 SOUR FamilySearch\n1 GEDC\n2 VERS 7.0.16\n1 CHAR UTF-8\n0 @I7@ INDI\n1 NAME Fictional Seven /Nguyen/\n1 BIRT\n2 DATE @#DJULIAN@ 3 MAR 1900\n1 _PHAN_LUNAR_DATE 12/03/Canh Ty\n0 TRLR\n", "utf8");
  const gedcom7Job = await uploadAndImport({
    filename: "synthetic-family-v7.ged", mimeType: "text/plain", bytes: gedcom7Bytes, format: "gedcom_7",
    sourceNamespace: "synthetic-m16", mappingVersion: "gedcom-subset/1",
  });
  const gedcom7Proof = runPsql(`select (j.classification='gedcom' and j.format='gedcom_7' and r.normalized #>> '{birthDate,calendar}'='julian' and r.normalized->'appSidecar' is not null) from private.import_jobs j join private.import_rows r on r.job_id=j.id where j.id=${sqlString(gedcom7Job.jobId)} and r.row_number=1;`, true);
  assert(gedcom7Proof.status === 0 && gedcom7Proof.stdout.trim() === "t", "GEDCOM 7 classification, Julian date, or app sidecar did not persist");

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
    assert((await page.locator("#mapping-death-date").inputValue()) === "" &&
      (await page.locator("#mapping-gender").inputValue()) === "" &&
      (await page.locator("#mapping-notes").inputValue()) === "", "optional source mappings should start unmapped");
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
    const browserImportBody = await browserImport.json();
    assert(browserImport.status() === 202, `authenticated browser import failed (${browserImport.status()}, ${browserImportBody?.data?.code ?? "no code"})`);
    const browserJob = browserImportBody;
    if (typeof browserJob?.data?.id === "string") jobIds.push(browserJob.data.id);
    await page.getByRole("heading", { name: "Kết quả dry-run" }).waitFor({ state: "visible", timeout: 15_000 });
    assert((await page.locator(".import-result").innerText()).includes("Fictional Gia đình"), "browser did not render the persisted mapped preview row");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Định dạng").selectOption("gedcom_551");
    const browserGedcom = Buffer.from("0 HEAD\n1 SOUR SyntheticFixture\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Fictional Browser /Nguyen/\n0 TRLR\n", "utf8");
    await page.locator("#import-file").setInputFiles({ name: "synthetic-browser.ged", mimeType: "text/plain", buffer: browserGedcom });
    const gedcomImportPromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/imports") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Tải lên và chạy dry-run" }).click();
    const browserGedcomImport = await gedcomImportPromise;
    assert(browserGedcomImport.status() === 202, `authenticated browser GEDCOM import failed (${browserGedcomImport.status()})`);
    const browserGedcomJob = await browserGedcomImport.json();
    if (typeof browserGedcomJob?.data?.id === "string") jobIds.push(browserGedcomJob.data.id);
    await page.getByRole("heading", { name: "Kết quả dry-run" }).waitFor({ state: "visible", timeout: 15_000 });
    assert((await page.locator(".import-result").innerText()).includes("Fictional Browser Nguyen"), "browser did not render the GEDCOM staged preview row");
    await context.close();
  } finally {
    await browser.close();
  }

  for (const [job, expectedPrecision] of [[jsonJob, "about"], [csvJob, "unknown"]]) {
    const proof = runPsql(`select ((r.normalized #>> '{birthDate,precision}')=${sqlString(expectedPrecision)} and j.mapping_snapshot->>'mappingVersion'=j.mapping_version) from private.import_jobs j join private.import_rows r on r.job_id=j.id where j.id=${sqlString(job.jobId)};`, true);
    assert(proof.status === 0 && proof.stdout.trim() === "t", "persisted date precision or mapping snapshot did not match the dry-run");
  }

  console.log("PASS local M16 authenticated browser/HTTP: synthetic BFF login, private JSON/CSV/GEDCOM 5.5.1/7 upload/finalize, checksum-verified dry-run, stable external UUID mapping/content-key replay, GEDCOM relationship endpoints persisted as review, conformance/date/raw preservation and capability-scoped persisted preview");
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
