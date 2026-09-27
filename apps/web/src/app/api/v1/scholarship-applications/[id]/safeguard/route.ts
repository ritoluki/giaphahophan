import { idempotencyKeySchema, scholarshipApplicationSchema, scholarshipSafeguardInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipSafeguardRpcResponse } from "@/app/api/v1/scholarship-response";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipApplicationSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_APPLICATION_ID", message: "Application id must be a UUID" }, 400);
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof scholarshipSafeguardInputSchema.parse>;
  try { input = scholarshipSafeguardInputSchema.parse(await request.json()); } catch { return apiJson({ code: "SCHOLARSHIP_SAFEGUARD_INPUT_INVALID", message: "Safeguard input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_application_safeguard_set", { p_application_id: parsedId.data, p_minor_status: input.minorStatus, p_guardian_status: input.guardianStatus, p_guardian_proof_asset_id: input.guardianProofAssetId, p_reason: input.reason, p_base_version: input.baseVersion, p_idempotency_key: key.data, p_request_hash: createRequestHash({ applicationId: parsedId.data, ...input }) });
  if (error) return apiJson({ code: "SCHOLARSHIP_SAFEGUARD_FAILED", message: "Safeguard was not accepted" }, rpcErrorStatus(error.code));
  try { const result = parseScholarshipSafeguardRpcResponse(data); if (!result) return apiJson({ code: "SCHOLARSHIP_SAFEGUARD_EMPTY", message: "Safeguard response was empty" }, 502); return apiJson(result); } catch { return apiJson({ code: "SCHOLARSHIP_SAFEGUARD_INVALID", message: "Safeguard response was invalid" }, 502); }
}