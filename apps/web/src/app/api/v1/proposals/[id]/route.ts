import { proposalDetailSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const proposalId = proposalDetailSchema.shape.id.safeParse(id);
  if (!proposalId.success) return apiJson({ code: "INVALID_PROPOSAL_ID", message: "Proposal id must be a UUID" }, 400);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("proposal_get", { p_proposal_id: proposalId.data });
  if (error) return apiJson({ code: "PROPOSAL_LOOKUP_FAILED", message: "Proposal is unavailable" }, rpcErrorStatus(error.code));
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return apiJson({ code: "PROPOSAL_NOT_FOUND", message: "Proposal not found" }, 404);

  try {
    const value = row as Record<string, unknown>;
    const items = Array.isArray(value.items) ? value.items : [];
    return apiJson(proposalDetailSchema.parse({
      id: value.id,
      trackingCode: value.tracking_code,
      treeId: value.tree_id,
      version: value.version,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
      status: value.status,
      kind: value.kind,
      reason: value.reason,
      branchId: value.branch_id,
      submittedBy: value.submitted_by,
      items
    }));
  } catch {
    return apiJson({ code: "PROPOSAL_INVALID", message: "Proposal projection is invalid" }, 503);
  }
}