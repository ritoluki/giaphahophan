import { createHash, createHmac, randomUUID } from "node:crypto";
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
function totpCode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes = [];
  for (const character of secret.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    assert(index >= 0, "synthetic MFA secret encoding invalid");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1000000).padStart(6, "0");
}
async function browserRequest(page, path, body, headers = {}) {
  return page.evaluate(async ({ path, body, headers }) => {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }, { path, body, headers });
}
async function browserMfa(page) {
  const enrolled = await browserRequest(page, "/api/v1/auth/mfa/enroll", {});
  assert(enrolled.status === 200 && enrolled.body?.data?.secret, "synthetic browser MFA enrollment failed");
  const challenge = await browserRequest(page, "/api/v1/auth/mfa/challenge", { factorId: enrolled.body.data.factorId });
  assert(challenge.status === 200, "synthetic browser MFA challenge failed");
  const verified = await browserRequest(page, "/api/v1/auth/mfa/verify", {
    factorId: enrolled.body.data.factorId, challengeId: challenge.body.data.challengeId, code: totpCode(enrolled.body.data.secret),
  });
  assert(verified.status === 200 && verified.body?.data?.aal === "aal2", "synthetic browser MFA verification failed");
}

const env = localEnv();
const treeId = randomUUID();
const membershipId = randomUUID();
const userEmail = `m16-${randomUUID()}@synthetic.test`;
const password = `Synthetic!${randomUUID()}`;
let userId;
let reviewerId;
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
  const chunkJob = await uploadAndImport({
    filename: "synthetic-chunks.json", mimeType: "application/json", format: "canonical_json",
    sourceNamespace: "synthetic-browser-chunks", mappingVersion: "structured-json/1",
    bytes: Buffer.from(JSON.stringify(Array.from({ length: 2501 }, (_, index) => ({ id: `chunk-${index + 1}`, name: `Hư cấu browser chunk ${index + 1}` }))), "utf8"),
    mapping: { mappingVersion: "structured-json/1", sourceNamespace: "synthetic-browser-chunks", dateInterpretation: "explicit_only",
      columns: { id: "externalId", name: "displayName" } },
  });
  const inspectionJob = await uploadAndImport({
    filename: "synthetic-inspection.json", mimeType: "application/json", format: "canonical_json", sourceNamespace: "synthetic-inspection", mappingVersion: "structured-json/1",
    bytes: Buffer.from(JSON.stringify(Array.from({ length: 51 }, (_, index) => ({ id: `inspection-${index + 1}`, name: `Hư cấu dòng ${index + 1}`, note: "private-inspection-marker" }))), "utf8"),
    mapping: { mappingVersion: "structured-json/1", sourceNamespace: "synthetic-inspection", dateInterpretation: "explicit_only", columns: { id: "externalId", name: "displayName" } },
  });
  const gedcomBytes = Buffer.from("0 HEAD\n1 SOUR SyntheticFixture\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Fictional An /Nguyen/\n1 FAMS @F1@\n1 BIRT\n2 DATE ABT 1940\n0 @I2@ INDI\n1 NAME Fictional Binh /Nguyen/\n1 FAMS @F1@\n0 @I3@ INDI\n1 NAME Fictional Chi /Nguyen/\n1 FAMC @F1@\n0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n1 _PHAN_LUNAR_DATE 12/03/Canh Ty\n0 TRLR\n", "utf8");
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
  const replayProof = runPsql(`select ((select count(*) from private.import_jobs where tree_id=${sqlString(treeId)} and file_sha256=${sqlString(sha256(gedcomBytes))} and mapping_version='gedcom-subset/1')=1 and (select count(*) from private.import_rows where job_id=${sqlString(gedcomJob.jobId)})=4 and (select count(*) from private.audit_events where tree_id=${sqlString(treeId)} and action='import.created' and resource_id=${sqlString(gedcomJob.jobId)})=1);`, true);
  assert(replayProof.status === 0 && replayProof.stdout.trim() === "t", "content-key replay duplicated jobs, rows, or create audit events");
  const stableMapAfter = runPsql(`select string_agg(external_id||':'||entity_kind||':'||canonical_id::text,',' order by external_id) from private.external_id_map where tree_id=${sqlString(treeId)} and source_namespace='synthetic-m16' and external_id in ('I1','F1') and entity_kind in ('person','family');`, true);
  assert(stableMapAfter.status === 0 && stableMapAfter.stdout.trim() === stableMapBefore.stdout.trim(), "content-key replay changed the stable canonical UUID reservations");
  const gedcomProof = runPsql(`select (j.classification='gedcom' and j.format='gedcom_551' and r.normalized #>> '{birthDate,precision}'='about' and r.raw_payload->'gedcom' is not null) from private.import_jobs j join private.import_rows r on r.job_id=j.id where j.id=${sqlString(gedcomJob.jobId)} and r.row_number=1;`, true);
  assert(gedcomProof.status === 0 && gedcomProof.stdout.trim() === "t", "GEDCOM format, date precision, or raw source preservation did not persist");
  const relationshipReviewProof = runPsql(`select (count(*)=4 and bool_and(r.status='review' and r.errors @> '["relationship_mapping_requires_review"]'::jsonb)) from private.import_rows r where r.job_id=${sqlString(gedcomJob.jobId)};`, true);
  assert(relationshipReviewProof.status === 0 && relationshipReviewProof.stdout.trim() === "t", "GEDCOM relationship family and all referenced people were not persisted as review-only");
  const relationshipPreview = await request(`${webUrl}/api/v1/imports/${gedcomJob.jobId}/preview`, { headers: { Cookie: cookie } });
  const relationshipState = await request(`${webUrl}/api/v1/imports/${gedcomJob.jobId}/relationships?baseVersion=${relationshipPreview.body.data.version}&after=0`, { headers: { Cookie: cookie } });
  assert(relationshipState.response.status === 200 && relationshipState.body.data.families.length === 1 &&
    relationshipState.body.data.families[0].partners.every((item) => item.relationshipOnlyReview) &&
    !JSON.stringify(relationshipState.body).includes("Fictional An /Nguyen/") && !JSON.stringify(relationshipState.body).includes("rawPayload"),
    "relationship projection must allowlist family references without exposing raw payload");
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
    assert((await page.getByRole("region", { name: "Kết quả dry-run" }).innerText()).includes("Fictional Gia đình"), "browser did not render the persisted mapped preview row");
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
    assert((await page.getByRole("region", { name: "Kết quả dry-run" }).innerText()).includes("Fictional Browser Nguyen"), "browser did not render the GEDCOM staged preview row");

    const applyJobId = browserGedcomJob.data.id;
    const reviewerEmail = `m16-review-${randomUUID()}@synthetic.test`;
    const reviewerPassword = `Synthetic!${randomUUID()}`;
    const reviewer = await request(`${env.API_URL}/auth/v1/admin/users`, {
      method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: reviewerEmail, password: reviewerPassword, email_confirm: true }),
    });
    assert(reviewer.response.ok && reviewer.body?.id, "synthetic reviewer creation failed");
    reviewerId = reviewer.body.id;
    const reviewerMembership = randomUUID();
    const reviewerSeed = runPsql(`begin;
      insert into private.memberships(id,tree_id,created_by,auth_user_id,role,status,approved_by) values(${sqlString(reviewerMembership)},${sqlString(treeId)},${sqlString(userId)},${sqlString(reviewerId)},'reviewer','active',${sqlString(userId)});
      insert into private.capability_grants(tree_id,created_by,membership_id,capability) values(${sqlString(treeId)},${sqlString(userId)},${sqlString(reviewerMembership)},'imports.manage'); commit;`);
    assert(reviewerSeed.status === 0, "synthetic reviewer capability seed failed");
    const reviewerContext = await browser.newContext({ viewport: { width: 320, height: 844 } });
    const reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(`${webUrl}/quan-tri/nhap-lieu`);
    const reviewerLogin = await browserRequest(reviewerPage, "/api/v1/auth/login", { email: reviewerEmail, password: reviewerPassword });
    assert(reviewerLogin.status === 200, "synthetic reviewer BFF login failed");
    const beforeMfa = await browserRequest(reviewerPage, `/api/v1/imports/${applyJobId}`);
    assert(beforeMfa.status === 200 && beforeMfa.body.data.canReview === false, `AAL1 reviewer must not be offered approve (${beforeMfa.status}, canReview=${beforeMfa.body?.data?.canReview}, canCancel=${beforeMfa.body?.data?.canCancel})`);
    const preview = await browserRequest(reviewerPage, `/api/v1/imports/${applyJobId}/preview`);
    const denied = await browserRequest(reviewerPage, `/api/v1/imports/${applyJobId}/approve`,
      { baseVersion: beforeMfa.body.data.job.version, snapshotHash: preview.body.data.snapshotHash },
      { "Idempotency-Key": randomUUID(), "X-CSRF-Token": beforeMfa.body.meta.csrfToken });
    assert(denied.status === 403, "BFF must deny AAL1 reviewer mutation");
    const rowDenied = await browserRequest(reviewerPage, `/api/v1/imports/${applyJobId}/rows`,
      { baseVersion: beforeMfa.body.data.job.version, snapshotHash: preview.body.data.snapshotHash, rowNumber: 1, excluded: true, reason: "Hư cấu kiểm tra quyền" },
      { "Idempotency-Key": randomUUID(), "X-CSRF-Token": beforeMfa.body.meta.csrfToken });
    assert(rowDenied.status === 403, "BFF must deny AAL1 row decision");
    const relationshipAal1Denied = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}/relationships`, {
      baseVersion: relationshipPreview.body.data.version, snapshotHash: relationshipPreview.body.data.snapshotHash,
      familyExternalId: "F1", partnerExternalIds: ["I1", "I2"], childExternalIds: ["I3"],
      parentLinks: [{ parentExternalId: "I1", childExternalId: "I3", kind: "biological", status: "disputed" }], reason: "Hư cấu: AAL1 phải bị từ chối",
    }, { "Idempotency-Key": randomUUID(), "X-CSRF-Token": beforeMfa.body.meta.csrfToken });
    assert(relationshipAal1Denied.status === 403, "BFF must deny AAL1 relationship mapping mutation");
    await browserMfa(reviewerPage);
    const relationshipPageAal1 = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}/relationships?baseVersion=${relationshipPreview.body.data.version}&after=0`);
    assert(relationshipPageAal1.status === 200 && relationshipPageAal1.body.data.families.length === 1, "authorized reviewer could not inspect source family references");
    await reviewerPage.goto(`${webUrl}/quan-tri/nhap-lieu?job=${gedcomJob.jobId}`);
    const familyCard = reviewerPage.locator(".import-relationship-card").first();
    await familyCard.waitFor();
    const participantChecks = familyCard.locator(".import-check input");
    assert(await participantChecks.count() === 3, "family editor did not show two partners and one child");
    await participantChecks.nth(0).check(); await participantChecks.nth(1).check(); await participantChecks.nth(2).check();
    const relationshipSelects = familyCard.locator("select");
    await relationshipSelects.nth(0).selectOption("I1"); await relationshipSelects.nth(1).selectOption("I3");
    await relationshipSelects.nth(2).selectOption("biological"); await relationshipSelects.nth(3).selectOption("disputed");
    await familyCard.getByRole("button", { name: "Thêm quan hệ tường minh" }).click();
    await familyCard.locator("textarea").fill("Hư cấu: đối chiếu từng dòng nguồn; quan hệ còn tranh nghị.");
    const relationshipSaveResponse = reviewerPage.waitForResponse((response) => response.url().endsWith(`/imports/${gedcomJob.jobId}/relationships`) && response.request().method() === "POST");
    await familyCard.getByRole("button", { name: "Lưu quyết định riêng tư" }).click();
    const relationshipSaved = await relationshipSaveResponse;
    const relationshipSavedBody = await relationshipSaved.json();
    assert(relationshipSaved.status() === 200 && relationshipSavedBody.data.mappingCount === 1, "authenticated relationship mapping save failed");
    await reviewerPage.waitForFunction(() => document.querySelector(".import-relationship-card")?.querySelectorAll(".import-check input:checked").length === 3);
    const relationshipStateAfter = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}`);
    const relationshipReplayHeaders = { "Idempotency-Key": relationshipSaved.request().headers()["idempotency-key"], "X-CSRF-Token": relationshipStateAfter.body.meta.csrfToken };
    const relationshipReplay = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}/relationships`, relationshipSaved.request().postDataJSON(), relationshipReplayHeaders);
    assert(relationshipReplay.status === 200 && relationshipReplay.body.data.version === relationshipSavedBody.data.version, "relationship exact retry changed the job version");
    const relationshipChangedState = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}`);
    const changedRelationshipReplay = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}/relationships`,
      { ...relationshipSaved.request().postDataJSON(), reason: "Hư cấu: nội dung đổi nhưng khóa cũ" },
      { ...relationshipReplayHeaders, "X-CSRF-Token": relationshipChangedState.body.meta.csrfToken });
    assert(changedRelationshipReplay.status === 409, `changed relationship retry should conflict, received HTTP ${changedRelationshipReplay.status} (${changedRelationshipReplay.body?.data?.code ?? "no code"})`);
    const staleRelationshipPage = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}/relationships?baseVersion=${relationshipPreview.body.data.version}&after=0`);
    assert(staleRelationshipPage.status === 409, "stale family relationship cursor was accepted after mapping change");
    const relationshipCanonicalProof = runPsql(`select ((select count(*) from private.import_relationship_mappings where job_id=${sqlString(gedcomJob.jobId)})=1 and (select count(*) from private.unions where tree_id=${sqlString(treeId)})=0 and (select count(*) from private.parent_links where tree_id=${sqlString(treeId)})=0);`, true);
    assert(relationshipCanonicalProof.status === 0 && relationshipCanonicalProof.stdout.trim() === "t", "saving a mapping changed canonical relationship tables");
    await reviewerPage.screenshot({ path: "reports/m16-relationships-320.png", fullPage: true });
    await reviewerPage.goto(`${webUrl}/quan-tri/nhap-lieu?job=${applyJobId}`);
    await reviewerPage.getByLabel("Lý do (bắt buộc)").fill("Hư cấu: cần đối chiếu nguồn");
    const excludeResponse = reviewerPage.waitForResponse((response) => response.url().endsWith(`/imports/${applyJobId}/rows`) && response.request().method() === "POST");
    await reviewerPage.getByRole("button", { name: "Lưu quyết định dòng" }).click();
    const excluded = await excludeResponse;
    assert(excluded.status() === 200 && (await excluded.json()).data.excluded === 1, "320px row exclusion was not persisted");
    await reviewerPage.waitForFunction(() => document.querySelector(".import-row-heading .tag")?.textContent === "Đã loại trừ");
    await reviewerPage.waitForFunction(() => Array.from(document.querySelectorAll("button")).find((item) => item.textContent === "Duyệt bản nhập demo")?.disabled);
    await reviewerPage.waitForFunction(() => document.querySelector("#import-decision-reason")?.value === "");
    const excludedState = await browserRequest(reviewerPage, `/api/v1/imports/${applyJobId}`);
    const rowReplayHeaders = { "Idempotency-Key": excluded.request().headers()["idempotency-key"], "X-CSRF-Token": excludedState.body.meta.csrfToken };
    const rowReplay = await browserRequest(reviewerPage, `/api/v1/imports/${applyJobId}/rows`, excluded.request().postDataJSON(), rowReplayHeaders);
    assert(rowReplay.status === 200 && rowReplay.body.data.version === excludedState.body.data.job.version, "row decision exact retry changed version");
    const rowChanged = await browserRequest(reviewerPage, `/api/v1/imports/${applyJobId}/rows`, { ...excluded.request().postDataJSON(), excluded: false }, rowReplayHeaders);
    assert(rowChanged.status === 409, `changed row retry returned unexpected HTTP ${rowChanged.status}`);
    await reviewerPage.reload();
    await reviewerPage.getByText("Đã loại trừ", { exact: true }).first().waitFor();
    await reviewerPage.getByLabel("Quyết định", { exact: true }).selectOption("restore");
    await reviewerPage.getByLabel("Lý do (bắt buộc)").fill("Hư cấu: đã đối chiếu, khôi phục");
    const restoreResponse = reviewerPage.waitForResponse((response) => response.url().endsWith(`/imports/${applyJobId}/rows`) && response.request().method() === "POST");
    await reviewerPage.getByRole("button", { name: "Lưu quyết định dòng" }).click();
    const restored = await restoreResponse;
    assert(restored.status() === 200 && (await restored.json()).data.excluded === 0, "row restore failed");
    await reviewerPage.getByRole("heading", { name: "Kết quả dry-run" }).waitFor();
    const approveButton = reviewerPage.getByRole("button", { name: "Duyệt bản nhập demo" });
    await reviewerPage.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find((item) => item.textContent === "Duyệt bản nhập demo")?.disabled);
    const approvedResponse = reviewerPage.waitForResponse((response) => response.url().endsWith(`/imports/${applyJobId}/approve`));
    await approveButton.click();
    const approvalResponse = await approvedResponse;
    assert(approvalResponse.status() === 200, `independent browser review failed (${approvalResponse.status()}, ${(await approvalResponse.text()).slice(0, 300)})`);
    await reviewerPage.getByRole("button", { name: "Áp dụng vào cây demo" }).waitFor();
    assert(await reviewerPage.getByRole("button", { name: "Áp dụng vào cây demo" }).isDisabled(), "reviewer cannot apply own approval");
    await browserMfa(page);
    await page.reload();
    const applyButton = page.getByRole("button", { name: "Áp dụng vào cây demo" });
    await applyButton.waitFor();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find((item) => item.textContent === "Áp dụng vào cây demo")?.disabled);
    const appliedResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${applyJobId}/commit`));
    await applyButton.click();
    const applied = await appliedResponse;
    assert(applied.status() === 202 && (await applied.json()).data.status === "completed", "browser commit did not persist canonical demo records");
    await page.locator(".import-safety-note").filter({ hasText: /1 hồ sơ, 0 gia đình và 0 quan hệ cha mẹ/ }).waitFor();
    const originalRequest = applied.request();
    const replayState = await browserRequest(page, `/api/v1/imports/${applyJobId}`);
    const replayHeaders = { "Idempotency-Key": originalRequest.headers()["idempotency-key"], "X-CSRF-Token": replayState.body.meta.csrfToken };
    const replayed = await browserRequest(page, `/api/v1/imports/${applyJobId}/commit`, originalRequest.postDataJSON(), replayHeaders);
    assert(replayed.status === 202 && replayed.body.data.status === "completed", "browser commit exact replay failed");
    const changedReplay = await browserRequest(page, `/api/v1/imports/${applyJobId}/commit`,
      { ...originalRequest.postDataJSON(), baseVersion: originalRequest.postDataJSON().baseVersion + 1 }, replayHeaders);
    assert(changedReplay.status === 409, "changed browser commit replay must be rejected");
    const csrfDenied = await browserRequest(page, `/api/v1/imports/${applyJobId}/commit`, originalRequest.postDataJSON(), { ...replayHeaders, "X-CSRF-Token": "0".repeat(64) });
    assert(csrfDenied.status === 403, "invalid CSRF accepted");
    await page.reload();
    await page.locator(".import-safety-note").filter({ hasText: /1 hồ sơ, 0 gia đình và 0 quan hệ cha mẹ/ }).waitFor();
    const appliedProof = runPsql(`select ((select count(*) from private.persons where tree_id=${sqlString(treeId)})=1
      and (select count(*) from private.citations where tree_id=${sqlString(treeId)})=1
      and (select count(*) from private.audit_events where tree_id=${sqlString(treeId)} and action='import.applied')=1);`, true);
    assert(appliedProof.status === 0 && appliedProof.stdout.trim() === "t", "canonical apply/replay count or source citation mismatch");
    const contentReplay = await uploadAndImport({ filename: "synthetic-applied-replay.ged", mimeType: "text/plain", bytes: browserGedcom,
      format: "gedcom_551", sourceNamespace: "family-records", mappingVersion: "gedcom-subset/1" });
    assert(contentReplay.jobId === applyJobId, "applied source replay created another import job");
    const relationshipReviewState = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}`);
    const relationshipReviewPreview = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}/preview`);
    const relationshipApproved = await browserRequest(reviewerPage, `/api/v1/imports/${gedcomJob.jobId}/approve`, {
      baseVersion: relationshipReviewState.body.data.job.version, snapshotHash: relationshipReviewPreview.body.data.snapshotHash,
    }, { "Idempotency-Key": randomUUID(), "X-CSRF-Token": relationshipReviewState.body.meta.csrfToken });
    assert(relationshipApproved.status === 200 && relationshipApproved.body.data.job.status === "ready", "independent reviewer could not approve complete GEDCOM relationships");
    const relationshipReadyState = await browserRequest(page, `/api/v1/imports/${gedcomJob.jobId}`);
    const relationshipCommitRequest = {
      baseVersion: relationshipReadyState.body.data.job.version,
      approvedSnapshotHash: relationshipReadyState.body.data.approvedSnapshotHash,
      approvalId: relationshipReadyState.body.data.approvalId,
    };
    const relationshipCommitHeaders = { "Idempotency-Key": randomUUID(), "X-CSRF-Token": relationshipReadyState.body.meta.csrfToken };
    const relationshipApplied = await browserRequest(page, `/api/v1/imports/${gedcomJob.jobId}/commit`, relationshipCommitRequest, relationshipCommitHeaders);
    assert(relationshipApplied.status === 202 && relationshipApplied.body.data.status === "completed" &&
      relationshipApplied.body.data.counters.succeeded === 3, "authenticated browser relationship commit failed");
    const relationshipCommittedState = await browserRequest(page, `/api/v1/imports/${gedcomJob.jobId}`);
    assert(relationshipCommittedState.body.data.appliedPeople === 3 && relationshipCommittedState.body.data.appliedUnions === 1 &&
      relationshipCommittedState.body.data.appliedParentLinks === 1 && relationshipCommittedState.body.data.canCancel === false, "relationship apply projection counts or cancellation boundary did not reload");
    const relationshipCommitReplay = await browserRequest(page, `/api/v1/imports/${gedcomJob.jobId}/commit`, relationshipCommitRequest,
      { ...relationshipCommitHeaders, "X-CSRF-Token": relationshipCommittedState.body.meta.csrfToken });
    assert(relationshipCommitReplay.status === 202 && relationshipCommitReplay.body.data.status === "completed", "relationship commit replay failed");
    const relationshipCommitProof = runPsql(`select ((select count(*) from private.persons p join private.external_id_map m on m.tree_id=p.tree_id and m.canonical_id=p.id where p.tree_id=${sqlString(treeId)} and m.source_namespace='synthetic-m16' and m.entity_kind='person' and m.external_id in ('I1','I2','I3'))=3 and (select count(*) from private.unions u join private.external_id_map m on m.tree_id=u.tree_id and m.canonical_id=u.id where u.tree_id=${sqlString(treeId)} and m.source_namespace='synthetic-m16' and m.external_id='F1')=1 and (select count(*) from private.parent_links pl join private.sources s on s.tree_id=pl.tree_id and s.id=pl.source_id where pl.tree_id=${sqlString(treeId)} and s.provider_name='synthetic-m16')=1 and (select count(*) from private.citations c join private.sources s on s.tree_id=c.tree_id and s.id=c.source_id where c.tree_id=${sqlString(treeId)} and s.provider_name='synthetic-m16')=6);`, true);
    assert(relationshipCommitProof.status === 0 && relationshipCommitProof.stdout.trim() === "t", "browser relationship commit did not persist canonical entities and citations exactly once");
    await page.goto(`${webUrl}/quan-tri/nhap-lieu?job=${gedcomJob.jobId}`);
    await page.locator(".import-safety-note").filter({ hasText: /3 hồ sơ, 1 gia đình và 1 quan hệ cha mẹ/ }).waitFor();
    const overflow = await reviewerPage.evaluate(() => {
      const width = window.innerWidth;
      const elements = Array.from(document.querySelectorAll("main *")).map((element) => ({ tag: element.tagName, className: element.className,
        right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) }))
        .filter((item) => item.right > width + 1).slice(0, 12);
      return { elements, styles: document.styleSheets.length, grid: getComputedStyle(document.querySelector(".import-workspace")).display,
        bodyMargin: getComputedStyle(document.body).margin, cardPadding: getComputedStyle(document.querySelector("section.import-result")).padding };
    });
    assert((await reviewerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), `review UI overflows at 320px: ${JSON.stringify(overflow)}`);
    await reviewerPage.screenshot({ path: "reports/m16-review-320.png", fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`${webUrl}/quan-tri/nhap-lieu?job=${inspectionJob.jobId}`);
    const inspector = page.locator(".import-row-inspector");
    await inspector.locator(".import-row-card").first().waitFor();
    assert(await inspector.locator(".import-row-card").count() === 50, "inspection page must be bounded to50");
    await inspector.getByRole("button", { name: "Trang dòng tiếp" }).click();
    await inspector.getByRole("button", { name: "Chọn dòng 51" }).waitFor();
    assert(await inspector.locator(".import-row-card").count() === 1, "second inspection page must contain only row51");
    await inspector.getByRole("button", { name: "Chọn dòng 51" }).click();
    assert(await page.getByLabel("Số dòng nguồn").inputValue() === "51", "select row51 did not populate decision form");
    const inspectionPreview = await browserRequest(page, `/api/v1/imports/${inspectionJob.jobId}/preview`);
    const inspectionVersion = inspectionPreview.body.data.version;
    const inspectionState = await browserRequest(page, `/api/v1/imports/${inspectionJob.jobId}/rows?baseVersion=${inspectionVersion}&after=50`);
    assert(inspectionState.status === 200 && !JSON.stringify(inspectionState.body).includes("private-inspection-marker"), "inspection leaked private source or version changed unexpectedly");
    await page.getByLabel("Lý do (bắt buộc)").fill("Hư cấu: loại trừ dòng 51 sau đối chiếu");
    const selectedResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${inspectionJob.jobId}/rows`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Lưu quyết định dòng" }).click();
    assert((await selectedResponse).status() === 200, "row51 decision not saved");
    await page.waitForFunction(() => document.querySelector("#import-decision-reason")?.value === "");
    const stalePage = await browserRequest(page, `/api/v1/imports/${inspectionJob.jobId}/rows?baseVersion=${inspectionVersion}&after=50`);
    assert(stalePage.status === 409, "stale inspection cursor accepted after decision");
    await page.reload();
    await inspector.getByRole("button", { name: "Trang dòng tiếp" }).waitFor();
    await inspector.getByRole("button", { name: "Trang dòng tiếp" }).click();
    await inspector.getByText("Đã loại trừ", { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "row inspector overflow at320px");
    await page.screenshot({ path: "reports/m16-inspection-320.png", fullPage: true });
    const cancelState = await browserRequest(page, `/api/v1/imports/${inspectionJob.jobId}`);
    assert(cancelState.body.data.canCancel === true, "unapplied import did not expose authorized cancellation capability");
    await page.goto(`${webUrl}/quan-tri/nhap-lieu?job=${inspectionJob.jobId}`);
    await page.getByLabel("Lý do hủy").fill("Synthetic fixture no longer required");
    const cancelledResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${inspectionJob.jobId}/cancel`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Hủy bản nhập" }).click();
    const cancelled = await cancelledResponse;
    const cancelledBody = await cancelled.json();
    assert(cancelled.status() === 200 && cancelledBody.data?.job?.status === "cancelled", `authorized pre-apply cancellation did not persist (${cancelled.status()}, ${JSON.stringify(cancelledBody).slice(0, 300)})`);
    const originalCancelRequest = cancelled.request();
    const cancelHeaders = { "Idempotency-Key": originalCancelRequest.headers()["idempotency-key"], "X-CSRF-Token": originalCancelRequest.headers()["x-csrf-token"] };
    const originalCancelBody = originalCancelRequest.postDataJSON();
    const cancellationReplay = await browserRequest(page, `/api/v1/imports/${inspectionJob.jobId}/cancel`, originalCancelBody, cancelHeaders);
    assert(cancellationReplay.status === 200 && cancellationReplay.body.data.job.status === "cancelled", "exact cancellation replay failed");
    const changedCancellationReplay = await browserRequest(page, `/api/v1/imports/${inspectionJob.jobId}/cancel`,
      { ...originalCancelBody, reason: "Different cancellation reason" }, cancelHeaders);
    assert(changedCancellationReplay.status === 409, "changed cancellation replay must conflict");
    const cancelledState = await browserRequest(page, `/api/v1/imports/${inspectionJob.jobId}`);
    assert(cancelledState.body.data.canCancel === false, "cancelled import remained cancellable");
    await reviewerPage.goto(`${webUrl}/quan-tri/nhap-lieu?job=${chunkJob.jobId}`);
    const chunkApprovalResponse = reviewerPage.waitForResponse((response) => response.url().endsWith(`/imports/${chunkJob.jobId}/approve`) && response.request().method() === "POST");
    await reviewerPage.getByRole("button", { name: "Duyệt bản nhập demo" }).click();
    const chunkApproval = await chunkApprovalResponse;
    assert(chunkApproval.status() === 200, "independent UI review of2501 people was blocked");
    await page.goto(`${webUrl}/quan-tri/nhap-lieu?job=${chunkJob.jobId}`);
    const startChunk = page.getByRole("button", { name: "Bắt đầu nhập theo lượt" });
    await startChunk.waitFor();
    assert(await page.getByRole("button", { name: "Áp dụng vào cây demo" }).count() === 0, "large batch exposed atomic commit UI");
    const chunkFirstResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${chunkJob.jobId}/chunks`) && response.request().method() === "POST");
    await startChunk.click();
    const chunkFirst = await chunkFirstResponse;
    const chunkFirstBody = await chunkFirst.json();
    assert(chunkFirst.status() === 202 && chunkFirstBody.data?.job?.status === "partially_applied" &&
      chunkFirstBody.data.appliedPeople === 500 && chunkFirstBody.data.chunkProgress.total === 6, "first browser chunk did not persist");
    await page.getByText("Đã lưu 1/6 lượt nhập.", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("Đã áp dụng một phần", { exact: true }).waitFor();
    const nextChunkResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${chunkJob.jobId}/chunks`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Lưu lượt nhập tiếp theo" }).click();
    const chunkNext = await nextChunkResponse;
    const chunkNextBody = await chunkNext.json();
    assert(chunkNext.status() === 202 && chunkNextBody.data.appliedPeople === 1000 && chunkNextBody.data.chunkProgress.committed === 2, "next chunk did not resume after reload");
    await page.getByText("Đã lưu 2/6 lượt nhập.", { exact: true }).waitFor();
    const chunkState = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}`);
    const chunkRetryHeaders = { "Idempotency-Key": chunkFirst.request().headers()["idempotency-key"], "X-CSRF-Token": chunkState.body.meta.csrfToken };
    const chunkReplay = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}/chunks`, chunkFirst.request().postDataJSON(), chunkRetryHeaders);
    assert(chunkReplay.status === 202 && chunkReplay.body.data.appliedPeople === 500, "durable chunk replay failed");
    const changedChunkReplay = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}/chunks`,
      { ...chunkFirst.request().postDataJSON(), baseVersion: chunkState.body.data.job.version }, chunkRetryHeaders);
    assert(changedChunkReplay.status === 409, "changed chunk replay accepted");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "partial import UI overflows320px");
    await page.screenshot({ path: "reports/m16-chunks-320.png", fullPage: true });
    await page.getByLabel("Lý do hủy").fill("Hư cấu: dừng sau hai lượt, giữ hồ sơ đã nhập");
    const partialCancelResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${chunkJob.jobId}/cancel`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Hủy bản nhập" }).click();
    const partialCancel = await partialCancelResponse;
    const partialCancelBody = await partialCancel.json();
    assert(partialCancel.status() === 200 && partialCancelBody.data.appliedPeople === 1000 &&
      partialCancelBody.data.chunkProgress.committed === 2 && !partialCancelBody.data.canApplyChunk,
      `partial cancellation failed (${partialCancel.status()}, ${JSON.stringify(partialCancelBody).slice(0, 300)})`);
    await page.getByText("Đã hủy · giữ phần đã lưu", { exact: true }).waitFor();
    const stoppedState = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}`);
    const stoppedRequest = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}/chunks`, {
      baseVersion: stoppedState.body.data.job.version, approvalId: chunkFirst.request().postDataJSON().approvalId,
      approvedSnapshotHash: chunkFirst.request().postDataJSON().approvedSnapshotHash, sequence: 3,
    }, { "Idempotency-Key": randomUUID(), "X-CSRF-Token": stoppedState.body.meta.csrfToken });
    assert(stoppedRequest.status === 409, "cancelled chunk job could continue");
    const chunkProof = runPsql(`select (select count(*) from private.persons p join private.external_id_map m on m.tree_id=p.tree_id and m.canonical_id=p.id
      where p.tree_id=${sqlString(treeId)} and m.source_namespace='synthetic-browser-chunks')=1000
      and (select count(*) from private.import_chunks where job_id=${sqlString(chunkJob.jobId)} and status='completed')=2;`, true);
    assert(chunkProof.status === 0 && chunkProof.stdout.trim() === "t", "chunk retry/cancel DB counts mismatch");
    const compensationPanel = page.getByRole("region", { name: "Hoàn tác bản nhập" });
    await compensationPanel.getByLabel("Lý do đề nghị hoàn tác").fill("Hư cấu: hoàn tác 1000 hồ sơ sau khi dừng nhập");
    const compensationRequestResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${chunkJob.jobId}/compensation`) && response.request().method() === "POST");
    await compensationPanel.getByRole("button", { name: "Gửi đề nghị hoàn tác" }).click();
    const compensationRequested = await compensationRequestResponse;
    const compensationRequestBody = await compensationRequested.json();
    assert(compensationRequested.status() === 200 && compensationRequestBody.data.compensation.status === "pending",
      `compensation request failed (${compensationRequested.status()}, ${JSON.stringify(compensationRequestBody).slice(0, 300)})`);
    const pendingState = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}`);
    const selfApprove = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}/compensation`, {
      action: "approve", baseVersion: pendingState.body.data.job.version,
      reviewId: pendingState.body.data.compensation.id, reviewVersion: pendingState.body.data.compensation.version,
    }, { "Idempotency-Key": randomUUID(), "X-CSRF-Token": pendingState.body.meta.csrfToken });
    assert(selfApprove.status === 403, "requester self-approved compensation");
    await reviewerPage.goto(`${webUrl}/quan-tri/nhap-lieu?job=${chunkJob.jobId}`);
    const compensationApproveResponse = reviewerPage.waitForResponse((response) => response.url().endsWith(`/imports/${chunkJob.jobId}/compensation`) && response.request().method() === "POST");
    await reviewerPage.getByRole("button", { name: "Duyệt yêu cầu hoàn tác" }).click();
    assert((await compensationApproveResponse).status() === 200, "separate reviewer could not approve compensation");
    await page.reload();
    const compensationCommitButton = page.getByRole("button", { name: "Thực hiện hoàn tác đã duyệt" });
    await compensationCommitButton.waitFor();
    const compensationCommitResponse = page.waitForResponse((response) => response.url().endsWith(`/imports/${chunkJob.jobId}/compensation`) && response.request().method() === "POST");
    await compensationCommitButton.click();
    const compensated = await compensationCommitResponse;
    const compensatedBody = await compensated.json();
    assert(compensated.status() === 200 && compensatedBody.data.compensation.status === "completed" && compensatedBody.data.appliedPeople === 0,
      `compensation did not persist (${compensated.status()}, ${JSON.stringify(compensatedBody).slice(0, 300)})`);
    await page.getByText("Đã hoàn tác bản nhập", { exact: true }).waitFor();
    const compensatedState = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}`);
    const compensationReplay = await browserRequest(page, `/api/v1/imports/${chunkJob.jobId}/compensation`, compensated.request().postDataJSON(),
      { "Idempotency-Key": compensated.request().headers()["idempotency-key"], "X-CSRF-Token": compensatedState.body.meta.csrfToken });
    assert(compensationReplay.status === 200 && compensationReplay.body.data.compensation.status === "completed", "compensation exact retry failed");
    const compensationProof = runPsql(`select not exists(select 1 from private.persons p join private.external_id_map m on m.tree_id=p.tree_id
      and m.canonical_id=p.id where p.tree_id=${sqlString(treeId)} and m.source_namespace='synthetic-browser-chunks')
      and not exists(select 1 from private.sources where tree_id=${sqlString(treeId)} and provider_name='synthetic-browser-chunks')
      and (select count(*) from private.import_rows where job_id=${sqlString(chunkJob.jobId)})=2501
      and exists(select 1 from private.media_assets where id=${sqlString(chunkJob.assetId)});`, true);
    assert(compensationProof.status === 0 && compensationProof.stdout.trim() === "t", "compensation lost original staging/source or left canonical rows");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "compensation UI overflow320px");
    await page.screenshot({ path: "reports/m16-compensation-320.png", fullPage: true });
    const exportContext = await browserRequest(page, "/api/v1/exports");
    assert(exportContext.status === 200 && /^[a-f0-9]{64}$/.test(exportContext.body.data.csrfToken), "export CSRF context unavailable");
    const exportInput = { treeId, format: "canonical_json", scope: { kind: "tree" }, reason: "Synthetic permission export", audience: "members", includeMedia: false };
    const exportKey = randomUUID();
    const exportHeaders = { "Idempotency-Key": exportKey, "X-CSRF-Token": exportContext.body.data.csrfToken };
    const queuedExport = await browserRequest(page, "/api/v1/exports", exportInput, exportHeaders);
    assert(queuedExport.status === 202 && queuedExport.body.data.status === "queued", "export job did not durably queue");
    const exportId = queuedExport.body.data.id;
    const exportState = await browserRequest(page, `/api/v1/exports/${exportId}`);
    assert(exportState.status === 200 && exportState.body.data.id === exportId && !exportState.body.data.resultAssetId, "export state fabricated output");
    const exportReplay = await browserRequest(page, "/api/v1/exports", exportInput, exportHeaders);
    assert(exportReplay.status === 202 && exportReplay.body.data.id === exportId, "export replay duplicated job");
    const exportChanged = await browserRequest(page, "/api/v1/exports", { ...exportInput, format: "csv" }, exportHeaders);
    assert(exportChanged.status === 409, "changed export replay accepted");
    const exportBadCsrf = await browserRequest(page, "/api/v1/exports", exportInput, { ...exportHeaders, "X-CSRF-Token": "0".repeat(64) });
    assert(exportBadCsrf.status === 403, "export bad CSRF accepted");
    const exportOverride = await browserRequest(page, "/api/v1/exports", { ...exportInput, includePrivate: true }, { ...exportHeaders, "Idempotency-Key": randomUUID() });
    assert(exportOverride.status === 400, "export raw override accepted");
    assert((await browserRequest(reviewerPage, `/api/v1/exports/${exportId}`)).status === 403, "different actor read export job");
    for (const format of ["csv", "book_pdf"]) {
      const audience = format === "book_pdf" ? "public" : "members";
      const includeMedia = format === "book_pdf";
      const nextExport = await browserRequest(page, "/api/v1/exports", { ...exportInput, format, audience, includeMedia }, { ...exportHeaders, "Idempotency-Key": randomUUID() });
      assert(nextExport.status === 202 && nextExport.body.data.format === format && nextExport.body.data.audience === audience
        && nextExport.body.data.includeMedia === includeMedia, "export format/audience/media choice did not persist");
    }
    const exportQuota = await browserRequest(page, "/api/v1/exports", exportInput, { ...exportHeaders, "Idempotency-Key": randomUUID() });
    assert(exportQuota.status === 429, "fourth export exceeded daily quota");
    const exportProof = runPsql(`select count(*)=3 and bool_and(status='queued' and result_asset_id is null) from private.export_jobs where tree_id=${sqlString(treeId)};`, true);
    assert(exportProof.status === 0 && exportProof.stdout.trim() === "t", "queued export DB count/status mismatch");
    const exportExpire = runPsql(`update private.export_jobs set expires_at=clock_timestamp()-interval '1 second' where id=${sqlString(exportId)} and tree_id=${sqlString(treeId)};`);
    assert(exportExpire.status === 0 && (await browserRequest(page, `/api/v1/exports/${exportId}`)).status === 403, "expired export metadata available");
    const revokeExport = runPsql(`update private.memberships set status='revoked' where id=${sqlString(membershipId)} and tree_id=${sqlString(treeId)};`);
    assert(revokeExport.status === 0 && (await browserRequest(page, "/api/v1/exports", exportInput, exportHeaders)).status === 403, "revoked export actor replay accepted");
    assert(runPsql(`update private.memberships set status='active' where id=${sqlString(membershipId)} and tree_id=${sqlString(treeId)};`).status === 0, "synthetic membership restore failed");
    console.log("PASS local M16-06 authenticated HTTP metadata: queued DB/reload/exact replay,changed409,CSRF403,override400,cross-actor403,quota429,expiry/revocation403; rendering/download NOT_RUN");
    await reviewerContext.close();
    await context.close();
  } finally {
    await browser.close();
  }

  for (const [job, expectedPrecision] of [[jsonJob, "about"], [csvJob, "unknown"]]) {
    const proof = runPsql(`select ((r.normalized #>> '{birthDate,precision}')=${sqlString(expectedPrecision)} and j.mapping_snapshot->>'mappingVersion'=j.mapping_version) from private.import_jobs j join private.import_rows r on r.job_id=j.id where j.id=${sqlString(job.jobId)};`, true);
    assert(proof.status === 0 && proof.stdout.trim() === "t", "persisted date precision or mapping snapshot did not match the dry-run");
  }

  console.log("PASS local M16 authenticated browser/HTTP: intake/atomic/relationship regressions;2501-person independent UI approval,320px chunk apply/reload/continue,replay409,partial cancel retains1000 people and2/6 chunks; separate two-person compensation removes1000 unchanged people, rejects self-approval, preserves2501 staged records/original asset, retries exactly; CSRF refresh stability and cleanup");
} finally {
  if (treeId) {
    for (const assetId of assetIds) {
      for (const path of [`${userId}/${assetId}/original`]) {
        await fetch(`${env.API_URL}/storage/v1/object/family-assets/${path}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
      }
    }
    const cleanup = runPsql([
      "begin;",
      `delete from private.export_jobs where tree_id=${sqlString(treeId)};`,
      `delete from private.import_rows where job_id in (${jobIds.length ? jobIds.map(sqlString).join(",") : "null"});`,
      `delete from private.import_jobs where tree_id=${sqlString(treeId)};`,
      `delete from private.outbox where tree_id=${sqlString(treeId)};`,
      `delete from private.audit_events where tree_id=${sqlString(treeId)};`,
      `delete from private.idempotency_records where tree_id=${sqlString(treeId)};`,
      `delete from private.citations where tree_id=${sqlString(treeId)};`,
      `delete from private.union_children where tree_id=${sqlString(treeId)};`,
      `delete from private.union_partners where tree_id=${sqlString(treeId)};`,
      `delete from private.parent_links where tree_id=${sqlString(treeId)};`,
      `delete from private.external_id_map where tree_id=${sqlString(treeId)};`,
      `delete from private.unions where tree_id=${sqlString(treeId)};`,
      `delete from private.person_facts where tree_id=${sqlString(treeId)};`,
      `delete from private.person_names where tree_id=${sqlString(treeId)};`,
      `delete from private.persons where tree_id=${sqlString(treeId)};`,
      `delete from private.sources where tree_id=${sqlString(treeId)};`,
      `delete from private.media_assets where tree_id=${sqlString(treeId)};`,
      `delete from private.capability_grants where tree_id=${sqlString(treeId)};`,
      `delete from private.memberships where tree_id=${sqlString(treeId)};`,
      `delete from private.trees where id=${sqlString(treeId)};`,
      "commit;",
    ].join("\n"));
    assert(cleanup.status === 0, `Synthetic M16 HTTP fixture cleanup failed: ${cleanup.stderr || cleanup.stdout}`);
  }
  for (const syntheticId of [userId, reviewerId].filter(Boolean)) {
    const removed = await fetch(`${env.API_URL}/auth/v1/admin/users/${syntheticId}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
    assert(removed.ok, "Synthetic M16 user cleanup failed");
  }
}
