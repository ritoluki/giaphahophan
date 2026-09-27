import { mediaDownloadSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseMediaAssetRow } from "@/lib/server/media";

type RouteContext = { params: Promise<{ id: string }> };
const ACCESS_TTL_SECONDS = 300;
const VARIANT_PATTERN = /^(original|320|640|1280|1920)$/;

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  const client = await createRequestSupabaseClient();
  const user = await getVerifiedUser(client);
  if (!user) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const variant = new URL(request.url).searchParams.get("variant") ?? "original";
  if (!VARIANT_PATTERN.test(variant)) return apiJson({ code: "MEDIA_VARIANT_INVALID", message: "Media variant is invalid" }, 422);
  const { data, error } = await client.schema("api").rpc("media_asset_owner_access", { p_asset_id: id });
  if (error) return apiJson({ code: "MEDIA_ACCESS_FAILED", message: "Media access is unavailable" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  parseMediaAssetRow(row);
  const objectPath = variant === "original"
    ? `${user.id}/${id}/original`
    : `${user.id}/${id}/derivatives/${variant}.webp`;
  const { data: signed, error: signedError } = await client.storage
    .from("family-assets")
    .createSignedUrl(objectPath, ACCESS_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) return apiJson({ code: "MEDIA_SIGNED_URL_FAILED", message: "Media access is unavailable" }, 503);
  return apiJson(mediaDownloadSchema.parse({
    url: signed.signedUrl,
    expiresAt: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString(),
    mode: "signed"
  }));
}
