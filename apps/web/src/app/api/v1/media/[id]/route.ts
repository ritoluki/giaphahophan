import { mediaAssetSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseMediaAssetRow } from "@/lib/server/media";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("media_asset_get", { p_asset_id: id });
  if (error) return apiJson({ code: "MEDIA_LOOKUP_FAILED", message: "Media asset is unavailable" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  return apiJson(mediaAssetSchema.parse(parseMediaAssetRow(row)));
}
