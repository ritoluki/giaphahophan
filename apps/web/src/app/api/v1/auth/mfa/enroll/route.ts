import { apiJson, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";
import { appTotpFriendlyName, mfaErrorStatus, pendingAppTotpFactorIds } from "@/lib/server/mfa";
import { mfaEnrollResultSchema } from "@phan/contracts";

export async function POST() {
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  // A new enrollment explicitly replaces only this user's unfinished app TOTP.
  // Verified factors and other authenticators must never be removed here.
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) return apiJson({ code: "MFA_STATUS_FAILED", message: "Chưa kiểm tra được thiết lập xác thực." }, mfaErrorStatus(factors.error));
  for (const factorId of pendingAppTotpFactorIds(factors.data.all)) {
    const removed = await client.auth.mfa.unenroll({ factorId });
    if (removed.error) return apiJson({ code: "MFA_RESTART_FAILED", message: "Chưa tạo lại được mã. Hãy thử lại." }, mfaErrorStatus(removed.error));
  }
  const result = await client.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Phan Gia Phả",
    friendlyName: appTotpFriendlyName
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
