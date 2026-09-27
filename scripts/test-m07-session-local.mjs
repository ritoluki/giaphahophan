import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const webUrl = process.env.TEST_WEB_URL || "http://127.0.0.1:3119";
const container = "supabase_db_phan-gia-pha-local";

function localEnv() {
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd exec supabase status -o env"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error("Supabase local status failed");
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY) throw new Error("Supabase local auth endpoint is unavailable");
  return values;
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Keep assertions independent from provider error bodies.
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createSyntheticUser(env, email, password) {
  const result = await jsonRequest(env.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  assert(result.response.ok && result.body?.id, "local synthetic user creation failed");
  return result.body.id;
}

async function deleteSyntheticUser(env, userId) {
  if (!userId) return;
  await fetch(env.API_URL + "/auth/v1/admin/users/" + userId, {
    method: "DELETE",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SERVICE_ROLE_KEY
    }
  });
}

function responseCookies(response) {
  return response.headers.getSetCookie ? response.headers.getSetCookie() : [];
}

const env = localEnv();
const email = "session-" + randomUUID() + "@synthetic.test";
const password = "Synthetic!" + randomUUID();
let userId;

try {
  userId = await createSyntheticUser(env, email, password);

  const login = await jsonRequest(webUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const loginCookies = responseCookies(login.response);
  assert(login.response.status === 200 && login.body?.data?.authenticated === true, "BFF login did not authenticate");
  assert((login.response.headers.get("cache-control") || "").includes("no-store"), "login response is not no-store");
  assert(loginCookies.length > 0, "login did not issue refresh/access cookies");
  const cookieHeader = loginCookies.map((value) => value.split(";", 1)[0]).join("; ");

  const protectedBeforeLogout = await jsonRequest(webUrl + "/api/v1/kinship?from=" + randomUUID() + "&to=" + randomUUID(), {
    headers: { Cookie: cookieHeader }
  });
  assert(protectedBeforeLogout.response.status !== 401, "fresh session was rejected before logout");

  const logout = await jsonRequest(webUrl + "/api/v1/auth/sign-out", {
    method: "POST",
    headers: { Cookie: cookieHeader }
  });
  const logoutCookies = responseCookies(logout.response);
  assert(logout.response.status === 200 && logout.body?.data?.authenticated === false, "logout did not complete");
  assert((logout.response.headers.get("cache-control") || "").includes("no-store"), "logout response is not no-store");
  assert(logoutCookies.some((value) => /max-age=0|expires=thu, 01 jan 1970/i.test(value)), "logout did not clear auth cookies");

  const protectedAfterLogout = await jsonRequest(webUrl + "/api/v1/kinship?from=" + randomUUID() + "&to=" + randomUUID(), {
    headers: { Cookie: cookieHeader }
  });
  assert(protectedAfterLogout.response.status === 401, "revoked session still reached a sensitive action");

  const repeatLogout = await jsonRequest(webUrl + "/api/v1/auth/sign-out", { method: "POST" });
  assert(repeatLogout.response.status === 200 && repeatLogout.body?.data?.authenticated === false, "logout without a session was not idempotent");

  console.log("PASS local M07-02: auth refresh cookies, no-store logout response, cookie revocation, sensitive-action denial and idempotent empty state");
} finally {
  await deleteSyntheticUser(env, userId);
}
