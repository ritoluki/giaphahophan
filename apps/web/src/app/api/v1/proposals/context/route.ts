import { proposalContextSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function GET() {
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("proposal_submit_context");
  if (error) return apiJson({ code: "PROPOSAL_CONTEXT_FAILED", message: "Proposal context is unavailable" }, rpcErrorStatus(error.code));
  const rows: unknown[] = Array.isArray(data) ? data : [];
  try {
    return apiJson(rows.map((row) => proposalContextSchema.parse({
      treeId: (row as Record<string, unknown>).tree_id,
      treeName: (row as Record<string, unknown>).tree_name,
      branchId: (row as Record<string, unknown>).branch_id,
      branchName: (row as Record<string, unknown>).branch_name
    })));
  } catch {
    return apiJson({ code: "PROPOSAL_CONTEXT_INVALID", message: "Proposal context is invalid" }, 503);
  }
}