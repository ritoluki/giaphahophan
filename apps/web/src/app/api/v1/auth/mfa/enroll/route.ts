import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";
import { mfaErrorStatus } from "@/lib/server/mfa";
import { mfaEnrollResultSchema } from "@phan/contracts";

export async function POST() {
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const result = await client.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Phan Gia Phả",
    friendlyName: "Phan Gia Phả authenticator"
  });
  if (result.error || !result.data || result.data.type !== "totp") {
    return apiJson({ code: "MFA_ENROLL_FAILED", message: "Không thể bắt đầu thiết lập MFA" }, mfaErrorStatus(result.error ?? { code: "provider_error" }));
  }
  const data = mfaEnrollResultSchema.parse({
    factorId: result.data.id,
    qrCode: result.data.totp.qr_code,
    secret: result.data.totp.secret,
    uri: result.data.totp.uri
  });
  return apiJson(data);
}