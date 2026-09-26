import { idempotencyKeySchema, proposalMutationResultSchema, proposalSubmitInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request) {
  let input: ReturnType<typeof proposalSubmitInputSchema.parse>;
  try {
    input = proposalSubmitInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_PROPOSAL", message: "Proposal payload is invalid" }, 400);
  }

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) {
    return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  }

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) {
    return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  }
  const { data, error } = await client.schema("api").rpc("proposal_submit_idempotent", {
    p_tree_id: input.treeId,
    p_kind: input.kind,
    p_reason: input.reason,
    p_branch_id: input.branchId ?? null,
    p_base_snapshot: input.baseSnapshot ?? null,
    p_items: input.items.map((item) => ({
      target_kind: item.targetKind,
      target_id: item.targetId ?? null,
      base_version: item.baseVersion ?? null,
      operation: item.operation,
      field_changes: item.fieldChanges,
      source_ids: item.sourceIds
    })),
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash(input)
  });

  if (error) return apiJson({ code: "PROPOSAL_SUBMIT_FAILED", message: "Proposal was not accepted" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "PROPOSAL_EMPTY_RESPONSE", message: "Proposal response was empty" }, 502);

  const result = proposalMutationResultSchema.parse({
    id: row.id,
    treeId: row.tree_id,
    status: row.status,
    version: row.version
  });
  return apiJson(result, 201);
}
