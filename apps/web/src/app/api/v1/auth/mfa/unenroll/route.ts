import { mfaFactorInputSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";
import { mfaErrorStatus, readMfaStatus } from "@/lib/server/mfa";

export async function POST(request: Request) {
  let input: ReturnType<typeof mfaFactorInputSchema.parse>;
  try {
    input = mfaFactorInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_MFA_FACTOR", message: "MFA factor is invalid" }, 400);
  }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const removed = await client.auth.mfa.unenroll({ factorId: input.factorId });
  if (removed.error) return apiJson({ code: "MFA_UNENROLL_FAILED", message: "Không thể gỡ MFA theo policy hiện tại" }, mfaErrorStatus(removed.error));
  const status = await readMfaStatus(client);
  if (status.error) return apiJson({ code: "MFA_STATUS_FAILED", message: "MFA status is unavailable" }, mfaErrorStatus(status.error));
  return apiJson(status.data);
}