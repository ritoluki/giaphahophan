import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";
import { mfaErrorStatus, readMfaStatus } from "@/lib/server/mfa";

export async function GET() {
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const result = await readMfaStatus(client);
  if (result.error) return apiJson({ code: "MFA_STATUS_FAILED", message: "MFA status is unavailable" }, mfaErrorStatus(result.error));
  return apiJson(result.data);
}