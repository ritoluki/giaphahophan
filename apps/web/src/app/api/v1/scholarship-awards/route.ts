import { idempotencyKeySchema, scholarshipAwardInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipAwardRpcResponse } from "../scholarship-response";

export async function POST(request: Request) {
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof scholarshipAwardInputSchema.parse>;
  try { input = scholarshipAwardInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "SCHOLARSHIP_AWARD_INPUT_INVALID", message: "Scholarship award input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_award_create", {
    p_application_id: input.applicationId,
    p_amount_vnd: input.amountVnd,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash(input),
  });
  if (error) return apiJson({ code: "SCHOLARSHIP_AWARD_CREATE_FAILED", message: "Scholarship award could not be saved" }, rpcErrorStatus(error.code));
  try {
    const award = parseScholarshipAwardRpcResponse(data);
    if (!award) return apiJson({ code: "SCHOLARSHIP_AWARD_EMPTY_RESPONSE", message: "Scholarship award response was empty" }, 502);
    return apiJson(award, 201);
  } catch { return apiJson({ code: "SCHOLARSHIP_AWARD_INVALID_RESPONSE", message: "Scholarship award response was invalid" }, 502); }
}