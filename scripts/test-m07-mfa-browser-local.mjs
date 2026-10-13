import { randomUUID, createHmac } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import { mfaQrImageSource } from "../apps/web/src/lib/mfa-qr.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireWorker = createRequire(resolve(root, "apps/worker/package.json"));
const { chromium } = requireWorker("playwright");
const { createClient } = requireWorker("@supabase/supabase-js");
function check(value, message) { if (!value) throw new Error(message); }
const status = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", `${resolve(root, "node_modules/.bin/supabase.cmd")} status -o env`], { cwd: root, encoding: "utf8", windowsHide: true });
check(status.status === 0, "Local Supabase unavailable");
const settings = {};
for (const line of status.stdout.split(/\r?\n/)) {
  const match = /^([A-Z_]+)="(.*)"$/.exec(line);
  if (match) settings[match[1]] = match[2];
}
check(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(settings.API_URL), "Refusing non-loopback Auth");
check(settings.ANON_KEY && settings.SERVICE_ROLE_KEY, "Local Auth settings missing");
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let buffer = 0, bits = 0;
  const bytes = [];
  for (const character of secret.toUpperCase().replaceAll("=", "")) {
    const value = alphabet.indexOf(character);
    check(value >= 0, "Synthetic secret format invalid");
    buffer = (buffer << 5) | value; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1000000).padStart(6, "0");
}
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const origin = `http://127.0.0.1:${port}`;
const serverPath = resolve(root, "apps/web/.next-mfa-fix/standalone/apps/web/server.js");
const web = spawn(process.execPath, [serverPath], { cwd: dirname(serverPath), windowsHide: true, stdio: "ignore", env: {
  ...process.env, NODE_ENV: "production", APP_ENV: "test", DATA_MODE: "demo", PORT: String(port), HOSTNAME: "127.0.0.1",
  NEXT_PUBLIC_APP_URL: origin, NEXT_PUBLIC_SUPABASE_URL: settings.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: settings.ANON_KEY
} });
const service = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let userId, browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${origin}/api/v1/health/live`)).ok; } catch {}
    if (ready) break;
    check(web.exitCode === null, "Local server exited");
    await new Promise(done => setTimeout(done, 300));
  }
  check(ready, "Local server readiness failed");
  const email = `mfa-qa-${randomUUID()}@example.test`, password = `Synthetic!${randomUUID()}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  check(!created.error && created.data.user, "Synthetic user creation failed");
  userId = created.data.user.id;
  browser = await chromium.launch({ headless: true, chromiumSandbox: false });
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  // No trace, screenshots, videos, response bodies or credentials are written.
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(`${origin}/dang-nhap?next=/thiet-lap-mfa`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  const loginResponse = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/login"));
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const loginResult = await loginResponse;
  console.log(`Login diagnostic: HTTP${loginResult.status()}, setCookie=${!!(await loginResult.allHeaders())["set-cookie"]}, browserCookieCount=${(await context.cookies()).length}`);
  await page.waitForURL("**/thiet-lap-mfa");
  await page.getByRole("heading", { name: "Thiết lập xác thực hai bước", exact: true }).waitFor();
  await page.getByRole("button", { name: "Thiết lập ứng dụng xác thực" }).waitFor();
  await page.reload();
  const initialStatus = await context.request.get(`${origin}/api/v1/auth/mfa/status`);
  const initialData = await initialStatus.json();
  console.log(`Local session diagnostic: HTTP${initialStatus.status()}, authenticated=${initialData.data?.authenticated === true}, aal=${initialData.data?.aal ?? "none"}, enrolled=${initialData.data?.mfaEnrolled === true}`);
  await page.waitForTimeout(1500);
  console.log(`Pre-enrollment UI diagnostic: path=${new URL(page.url()).pathname}, heading=${await page.locator("h1").allTextContents()}, panel=${await page.locator(".mfa-panel, .mfa-state").allTextContents()}`);
  await page.getByRole("button", { name: "Thiết lập ứng dụng xác thực" }).waitFor();
  await page.goto(`${origin}/dang-nhap`);
  await page.getByRole("heading", { name: "Bạn đã đăng nhập" }).waitFor();
  await page.goto(`${origin}/thiet-lap-mfa`);
  const enrolledResponse = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/mfa/enroll") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Thiết lập ứng dụng xác thực" }).click();
  const first = await (await enrolledResponse).json();
  check(first.data?.factorId, "First enrollment failed");
  const direct = createClient(settings.API_URL, settings.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  check(!(await direct.auth.signInWithPassword({ email, password })).error, "Synthetic direct login failed");
  const other = await direct.auth.mfa.enroll({ factorType: "totp", friendlyName: "Unrelated synthetic authenticator" });
  check(!other.error && other.data, "Unrelated pending factor setup failed");
  const prolog = first.data.qrCode.slice(first.data.qrCode.indexOf(",") + 1).split("<svg", 1)[0];
  console.log(`QR format diagnostic: XML=${prolog.includes("<?xml")}, doctype=${prolog.includes("<!DOCTYPE")}, comment=${prolog.includes("<!--")}, encoded=${prolog.includes("%3C")}`);
  check(mfaQrImageSource(first.data.qrCode).startsWith("data:image/svg+xml;charset=utf-8,"), "Live provider QR normalization failed");
  await page.waitForTimeout(500);
  console.log(`Enrollment UI diagnostic: imageCount=${await page.locator(".mfa-qr-frame img").count()}, error=${await page.locator(".field-error").allTextContents()}`);
  await page.locator(".mfa-qr-frame img").waitFor();
  await page.waitForFunction(() => { const img = document.querySelector(".mfa-qr-frame img"); return img?.complete && img.naturalWidth > 0; });
  check(await page.locator(".mfa-secret").count() === 0, "Secret should be hidden by default");
  await page.reload();
  const newResponse = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/mfa/enroll") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Thiết lập ứng dụng xác thực" }).click();
  const replacement = await (await newResponse).json();
  check(replacement.data?.factorId && replacement.data.factorId !== first.data.factorId, "Pending enrollment replacement failed");
  const remaining = await direct.auth.mfa.listFactors();
  check(!remaining.error && remaining.data.all.some(factor => factor.id === other.data.id) && !remaining.data.all.some(factor => factor.id === first.data.factorId), "Replacement must preserve unrelated pending factors");
  await page.waitForFunction(() => { const img = document.querySelector(".mfa-qr-frame img"); return img?.complete && img.naturalWidth > 0; });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "MFA page overflows at 320px");
  await page.getByRole("button", { name: "Xác nhận MFA", exact: true }).waitFor();
  await page.locator("#mfa-code").fill(totp(replacement.data.secret));
  const verifiedResponse = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/mfa/verify"));
  await page.getByRole("button", { name: "Xác nhận MFA", exact: true }).click();
  const verified = await (await verifiedResponse).json();
  check(verified.data?.aal === "aal2", "Actual TOTP verification failed");
  await page.reload();
  await page.getByRole("link", { name: "Vào trang quản trị", exact: true }).waitFor();
  const persisted = await (await context.request.get(`${origin}/api/v1/auth/mfa/status`)).json();
  check(persisted.data?.aal === "aal2" && persisted.data.mfaEnrolled, "AAL2 cookie did not persist reload");
  // Explicit new-enrollment request must not delete a verified authenticator.
  await context.request.post(`${origin}/api/v1/auth/mfa/enroll`);
  const retained = await (await context.request.get(`${origin}/api/v1/auth/mfa/status`)).json();
  check(retained.data?.factorId === replacement.data.factorId && retained.data.mfaEnrolled, "Verified factor was modified");
  console.log("PASS local Chromium320: password session reload, signed-in feedback, rendered QR, pending replacement, hidden secret, no overflow, actual TOTP/AAL2 reload, verified factor retained.");
} finally {
  if (browser) await browser.close();
  web.kill();
  if (userId) {
    const removed = await service.auth.admin.deleteUser(userId);
    check(!removed.error, "Synthetic user cleanup failed");
    console.log("PASS synthetic local user/factors cleanup; no owner account modified.");
  }
}
