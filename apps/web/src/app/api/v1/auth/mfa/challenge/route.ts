import { mfaFactorInputSchema, mfaChallengeResultSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";
import { mfaErrorStatus } from "@/lib/server/mfa";

export async function POST(request: Request) {
  let input: ReturnType<typeof mfaFactorInputSchema.parse>;
  try {
    input = mfaFactorInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_MFA_FACTOR", message: "MFA factor is invalid" }, 400);
  }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const result = await client.auth.mfa.challenge({ factorId: input.factorId });
  if (result.error || !result.data) return apiJson({ code: "MFA_CHALLENGE_FAILED", message: "Không thể tạo thử thách MFA" }, mfaErrorStatus(result.error ?? { code: "provider_error" }));
  return apiJson(mfaChallengeResultSchema.parse({ challengeId: result.data.id, expiresAt: result.data.expires_at }));
}