import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3120";

function localEnv() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(String.fromCharCode(10))) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local auth endpoint is unavailable");
  return values;
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createSyntheticUser(env, email, password) {
  const result = await jsonRequest(env.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  assert(result.response.ok && result.body?.id, "synthetic recovery user creation failed");
  return result.body.id;
}

async function deleteSyntheticUser(env, userId) {
  if (!userId) return;
  await fetch(env.API_URL + "/auth/v1/admin/users/" + userId, {
    method: "DELETE",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY }
  });
}

function cookieHeader(response) {
  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  return cookies.map((value) => value.split(";", 1)[0]).join("; ");
}

const env = localEnv();
const email = "m07-recovery-" + randomUUID() + "@synthetic.test";
const unknownEmail = "unknown-" + randomUUID() + "@synthetic.test";
const oldPassword = "Synthetic!" + randomUUID();
const newPassword = "Synthetic!" + randomUUID();
let userId;

try {
  userId = await createSyntheticUser(env, email, oldPassword);


  const login = await jsonRequest(webUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: oldPassword })
  });
  assert(login.response.status === 200, "recovery fixture login failed (" + login.response.status + ")");
  const cookie = cookieHeader(login.response);
  assert(cookie.length > 0, "recovery fixture did not receive session cookie");
  const headers = { "Content-Type": "application/json", "Idempotency-Key": randomUUID() };
  const known = await jsonRequest(webUrl + "/api/v1/auth/password-recovery", {
    method: "POST",
    headers,
    body: JSON.stringify({ email })
  });
  const unknown = await jsonRequest(webUrl + "/api/v1/auth/password-recovery", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ email: unknownEmail })
  });
  assert(known.response.status === 200 && unknown.response.status === 200, "recovery did not use uniform success response");
  assert(JSON.stringify(known.body?.data) === JSON.stringify(unknown.body?.data), "recovery response differs for known and unknown email");
  assert(!JSON.stringify(known.body).includes(email) && !JSON.stringify(known.body).includes(unknownEmail), "recovery response leaked email");
  assert((known.response.headers.get("cache-control") || "").includes("no-store"), "recovery response is not no-store");

  const missingCode = await fetch(webUrl + "/xac-thuc?next=https%3A%2F%2Fevil.example%2Fsteal", { redirect: "manual" });
  assert(missingCode.status >= 300 && missingCode.status < 400, "callback missing-code response was not a redirect");
  const callbackLocation = new URL(missingCode.headers.get("location"));
  assert(["127.0.0.1", "0.0.0.0"].includes(callbackLocation.hostname) && callbackLocation.pathname === "/dang-nhap", "callback accepted external origin");
  assert(!missingCode.headers.get("location").includes("evil.example"), "callback leaked external redirect");


  const update = await jsonRequest(webUrl + "/api/v1/auth/password-update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ password: newPassword })
  });
  assert(update.response.status === 200 && update.body?.data?.updated === true, "password update failed");
  const oldLogin = await jsonRequest(webUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: oldPassword })
  });
  const newLogin = await jsonRequest(webUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: newPassword })
  });
  assert(oldLogin.response.status === 401 && newLogin.response.status === 200, "password update did not rotate credential");
  console.log("PASS local M07-05: uniform recovery response, no email enumeration/leak, safe callback redirect and authenticated password update");
} finally {
  await deleteSyntheticUser(env, userId);
}