import { idempotencyKeySchema, scholarshipAwardPaymentInputSchema, scholarshipAwardSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipAwardRpcResponse } from "@/app/api/v1/scholarship-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipAwardSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_AWARD_ID", message: "Award id must be a UUID" }, 400);
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof scholarshipAwardPaymentInputSchema.parse>;
  try { input = scholarshipAwardPaymentInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "SCHOLARSHIP_AWARD_PAYMENT_INPUT_INVALID", message: "Scholarship award payment input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_award_mark_paid", {
    p_award_id: parsedId.data,
    p_posted_journal_entry_id: input.postedJournalEntryId,
    p_base_version: input.baseVersion,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ awardId: parsedId.data, ...input }),
  });
  if (error) return apiJson({ code: "SCHOLARSHIP_AWARD_PAYMENT_FAILED", message: "Scholarship award payment could not be linked" }, rpcErrorStatus(error.code));
  try {
    const award = parseScholarshipAwardRpcResponse(data);
    if (!award) return apiJson({ code: "SCHOLARSHIP_AWARD_PAYMENT_EMPTY_RESPONSE", message: "Scholarship award payment response was empty" }, 502);
    return apiJson(award);
  } catch { return apiJson({ code: "SCHOLARSHIP_AWARD_PAYMENT_INVALID_RESPONSE", message: "Scholarship award payment response was invalid" }, 502); }
}