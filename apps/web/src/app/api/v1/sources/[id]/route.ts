import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseSourceRow } from "@/lib/server/sources";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const treeId = new URL(request.url).searchParams.get("treeId");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(treeId ?? "")) return apiJson({ code: "SOURCE_NOT_FOUND", message: "Source was not found" }, 404);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("source_get", { p_tree_id: treeId, p_source_id: id });
  if (error) return apiJson({ code: "SOURCE_LOOKUP_FAILED", message: "Source is unavailable" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "SOURCE_NOT_FOUND", message: "Source was not found" }, 404);
  return apiJson(parseSourceRow(row));
}
