import { mfaStatusSchema } from "@phan/contracts";
import type { createRequestSupabaseClient } from "@/lib/server/supabase-api";

export type RequestSupabaseClient = Awaited<ReturnType<typeof createRequestSupabaseClient>>;

export const appTotpFriendlyName = "Phan Gia Phả authenticator";
export function pendingAppTotpFactorIds(factors: ReadonlyArray<{ id: string; status: string; factor_type: string; friendly_name?: string }>): string[] {
  return factors.filter(factor => factor.status === "unverified" && factor.factor_type === "totp" && factor.friendly_name === appTotpFriendlyName).map(factor => factor.id);
}

export function mfaErrorStatus(error: { code?: string | undefined; message?: string | undefined }) {
  if (error.code === "insufficient_aal" || error.code === "mfa_verification_failed" || error.code === "mfa_verification_rejected") return 403;
  if (error.code === "mfa_factor_not_found" || error.code === "mfa_challenge_expired") return 409;
  if (error.code === "too_many_enrolled_mfa_factors" || error.code === "mfa_factor_name_conflict") return 409;
  if (error.code === "session_not_found") return 401;
  return 503;
}

export async function readMfaStatus(client: RequestSupabaseClient) {
  const [factors, assurance] = await Promise.all([
    client.auth.mfa.listFactors(),
    client.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (factors.error) return { error: factors.error } as const;
  if (assurance.error) return { error: assurance.error } as const;

  const verifiedTotp = factors.data.totp[0] ?? null;
  return {
    data: mfaStatusSchema.parse({
      authenticated: true,
      aal: assurance.data.currentLevel,
      mfaEnrolled: Boolean(verifiedTotp),
      factorId: verifiedTotp?.id ?? null
    })
  } as const;
}
