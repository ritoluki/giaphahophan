import { proposalDiffSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const proposalId = proposalDiffSchema.shape.proposalId.safeParse(id);
  if (!proposalId.success) return apiJson({ code: "INVALID_PROPOSAL_ID", message: "Proposal id must be a UUID" }, 400);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("proposal_diff", { p_proposal_id: proposalId.data });
  if (error) return apiJson({ code: "PROPOSAL_DIFF_FAILED", message: "Proposal diff is unavailable" }, rpcErrorStatus(error.code));
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return apiJson({ code: "PROPOSAL_NOT_FOUND", message: "Proposal not found" }, 404);
  try {
    const value = row as Record<string, unknown>;
    return apiJson(proposalDiffSchema.parse({
      proposalId: value.proposal_id,
      items: Array.isArray(value.items) ? value.items : []
    }));
  } catch {
    return apiJson({ code: "PROPOSAL_DIFF_INVALID", message: "Proposal diff projection is invalid" }, 503);
  }
}