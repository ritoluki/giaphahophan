import { claimMutationResultSchema, claimSubmitInputSchema, idempotencyKeySchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request) {
  let input: ReturnType<typeof claimSubmitInputSchema.parse>;
  try {
    input = claimSubmitInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_CLAIM", message: "Claim payload is invalid" }, 400);
  }

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) {
    return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  }

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) {
    return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  }

  const { data, error } = await client.schema("api").rpc("person_claim_submit_idempotent", {
    p_tree_id: input.treeId,
    p_person_id: input.personId,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash(input)
  });
  if (error) return apiJson({ code: "CLAIM_SUBMIT_FAILED", message: "Claim was not accepted" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "CLAIM_EMPTY_RESPONSE", message: "Claim response was empty" }, 502);

  return apiJson(claimMutationResultSchema.parse({
    id: row.id,
    treeId: row.tree_id,
    status: row.status,
    version: row.version
  }), 201);
}
