import { claimMutationResultSchema, claimReviewInputSchema, idempotencyKeySchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let input: ReturnType<typeof claimReviewInputSchema.parse>;
  try {
    input = claimReviewInputSchema.parse({ ...(await request.json()), claimId: id });
  } catch {
    return apiJson({ code: "INVALID_CLAIM_REVIEW", message: "Claim review payload is invalid" }, 400);
  }

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) {
    return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  }

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) {
    return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  }

  const { data, error } = await client.schema("api").rpc("person_claim_review_idempotent", {
    p_claim_id: input.claimId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_base_version: input.baseVersion,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash(input)
  });
  if (error) return apiJson({ code: "CLAIM_REVIEW_FAILED", message: "Claim review was not accepted" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "CLAIM_EMPTY_RESPONSE", message: "Claim review response was empty" }, 502);

  return apiJson(claimMutationResultSchema.parse({
    id: row.id,
    treeId: row.tree_id,
    status: row.status,
    version: row.version
  }));
}
