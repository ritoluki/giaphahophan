import { idempotencyKeySchema, proposalLifecycleInputSchema, proposalMutationResultSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function postProposalLifecycle(
  request: Request,
  context: RouteContext,
  action: "submit" | "withdraw"
) {
  const { id } = await context.params;
  const parsedId = proposalMutationResultSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_PROPOSAL_ID", message: "Proposal id must be a UUID" }, 400);
  let input: ReturnType<typeof proposalLifecycleInputSchema.parse>;
  try {
    input = proposalLifecycleInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_PROPOSAL_LIFECYCLE", message: "Lifecycle payload is invalid" }, 400);
  }
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("proposal_transition_idempotent", {
    p_proposal_id: parsedId.data,
    p_action: action,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ proposalId: parsedId.data, action, ...input })
  });
  if (error) return apiJson({ code: "PROPOSAL_LIFECYCLE_FAILED", message: "Proposal lifecycle transition was not accepted" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "PROPOSAL_LIFECYCLE_EMPTY", message: "Lifecycle response was empty" }, 502);
  return apiJson(proposalMutationResultSchema.parse({
    id: row.id,
    treeId: row.tree_id,
    status: row.status,
    version: row.version
  }));
}