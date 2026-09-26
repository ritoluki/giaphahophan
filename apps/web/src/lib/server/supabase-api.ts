import { createHash } from "node:crypto";
import { parsePublicEnv } from "@phan/config";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createRequestSupabaseClient() {
  const cookieStore = await cookies();
  const env = parsePublicEnv({
    APP_ENV: process.env.APP_ENV,
    DATA_MODE: process.env.DATA_MODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          for (const { name, value, options } of values) cookieStore.set(name, value, options);
        } catch {
          // Route handlers can read a session even when the response is immutable.
        }
      }
    }
  });
}

export async function getVerifiedUser(
  client: Awaited<ReturnType<typeof createRequestSupabaseClient>>
) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])])
    );
  }
  return value;
}

export function createRequestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function rpcErrorStatus(code: string | undefined) {
  if (code === "28000") return 401;
  if (code === "42501") return 403;
  if (code === "40001") return 409;
  if (code === "P0002") return 404;
  return 502;
}

export function apiJson(data: unknown, status = 200) {
  return Response.json(
    { data, meta: { requestId: crypto.randomUUID() } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
