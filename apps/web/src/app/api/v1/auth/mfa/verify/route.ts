import { mfaInputSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";
import { mfaErrorStatus, readMfaStatus } from "@/lib/server/mfa";

export async function POST(request: Request) {
  let input: ReturnType<typeof mfaInputSchema.parse>;
  try {
    input = mfaInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_MFA", message: "MFA verification payload is invalid" }, 400);
  }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const verified = await client.auth.mfa.verify(input);
  if (verified.error) return apiJson({ code: "MFA_VERIFY_FAILED", message: "MFA verification was not accepted" }, mfaErrorStatus(verified.error));
  const status = await readMfaStatus(client);
  if (status.error) return apiJson({ code: "MFA_STATUS_FAILED", message: "MFA status is unavailable" }, mfaErrorStatus(status.error));
  return apiJson(status.data);
}