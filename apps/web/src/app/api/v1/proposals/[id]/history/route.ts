import { proposalHistorySchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = proposalHistorySchema.shape.proposalId.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_PROPOSAL_ID", message: "Proposal id must be a UUID" }, 400);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("proposal_history", { p_proposal_id: parsedId.data });
  if (error) return apiJson({ code: "PROPOSAL_HISTORY_FAILED", message: "Proposal history is unavailable" }, rpcErrorStatus(error.code));
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return apiJson({ code: "PROPOSAL_NOT_FOUND", message: "Proposal not found" }, 404);
  try {
    const value = row as Record<string, unknown>;
    return apiJson(proposalHistorySchema.parse({
      proposalId: value.proposal_id,
      entries: Array.isArray(value.entries) ? value.entries : []
    }));
  } catch {
    return apiJson({ code: "PROPOSAL_HISTORY_INVALID", message: "Proposal history projection is invalid" }, 503);
  }
}