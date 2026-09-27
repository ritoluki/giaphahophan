import { apiJson, createRequestSupabaseClient } from "@/lib/server/supabase-api";

export async function POST() {
  const client = await createRequestSupabaseClient();
  const { error } = await client.auth.signOut();

  // Logout is idempotent: an already-expired or absent session still receives
  // a successful cookie-clearing response. Other auth failures are retried by
  // the user through the UI without exposing provider details.
  if (error && !/session missing/i.test(error.message)) {
    return apiJson({ code: "LOGOUT_FAILED", message: "Không thể kết thúc phiên lúc này" }, 503);
  }

  return apiJson({ authenticated: false });
}
