import { proposalReviewInputSchema, proposalMutationResultSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let input: ReturnType<typeof proposalReviewInputSchema.parse>;
  try {
    input = proposalReviewInputSchema.parse({ ...(await request.json()), proposalId: id });
  } catch {
    return apiJson({ code: "INVALID_REVIEW", message: "Review payload is invalid" }, 400);
  }

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) {
    return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  }
  const { data, error } = await client.schema("api").rpc("proposal_review", {
    p_proposal_id: input.proposalId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_base_version: input.baseVersion,
    p_reviewed_snapshot_hash: input.reviewedSnapshotHash
  });

  if (error) return apiJson({ code: "PROPOSAL_REVIEW_FAILED", message: "Proposal review was not accepted" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "PROPOSAL_EMPTY_RESPONSE", message: "Proposal review response was empty" }, 502);

  const result = proposalMutationResultSchema.parse({
    id: row.id,
    treeId: row.tree_id,
    status: row.status,
    version: row.version
  });
  return apiJson(result);
}
