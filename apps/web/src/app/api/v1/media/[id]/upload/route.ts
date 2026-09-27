import { createRequestSupabaseClient, apiJson, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { inspectMediaBytes, parseMediaAssetRow, type MediaUploadContext } from "@/lib/server/media";

type RouteContext = { params: Promise<{ id: string }> };
const MAX_UPLOAD_BYTES = 104857600;

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  const client = await createRequestSupabaseClient();
  const user = await getVerifiedUser(client);
  if (!user) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data: contextData, error: contextError } = await client.schema("api").rpc("media_upload_begin", { p_asset_id: id });
  if (contextError) return apiJson({ code: "MEDIA_UPLOAD_BEGIN_FAILED", message: "Upload could not be started" }, rpcErrorStatus(contextError.code));
  const row = Array.isArray(contextData) ? contextData[0] : contextData;
  if (!row) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  const uploadContext = { ...(row as unknown as Omit<MediaUploadContext, "object_path">), object_path: user.id + "/" + id + "/original" } satisfies MediaUploadContext;
  const declaredLength = Number(request.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(declaredLength) || declaredLength !== uploadContext.size_bytes || declaredLength > MAX_UPLOAD_BYTES) {
    await client.schema("api").rpc("media_upload_failed", { p_asset_id: id, p_reason: "SIZE_MISMATCH" });
    return apiJson({ code: "MEDIA_SIZE_MISMATCH", message: "Uploaded size does not match the intent" }, 400);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== uploadContext.size_bytes) {
    await client.schema("api").rpc("media_upload_failed", { p_asset_id: id, p_reason: "SIZE_MISMATCH" });
    return apiJson({ code: "MEDIA_SIZE_MISMATCH", message: "Uploaded size does not match the intent" }, 400);
  }
  const inspected = inspectMediaBytes(bytes, uploadContext.declared_mime, uploadContext.expected_sha256, false);
  if (!inspected.ok) {
    await client.schema("api").rpc("media_upload_failed", { p_asset_id: id, p_reason: inspected.code });
    return apiJson({ code: "MEDIA_CONTENT_REJECTED", message: "Uploaded content did not pass the safety checks" }, 422);
  }
  const { error: storageError } = await client.storage.from("family-assets").upload(uploadContext.object_path, bytes, {
    contentType: uploadContext.declared_mime, cacheControl: "no-store", upsert: false
  });
  if (storageError) {
    await client.schema("api").rpc("media_upload_failed", { p_asset_id: id, p_reason: "STORAGE_WRITE_FAILED" });
    return apiJson({ code: "MEDIA_STORAGE_WRITE_FAILED", message: "Media storage is unavailable" }, 503);
  }
  const { data, error } = await client.schema("api").rpc("media_upload_marked", {
    p_asset_id: id, p_actual_size: bytes.byteLength, p_actual_mime: uploadContext.declared_mime,
    p_actual_sha256: inspected.actualSha256
  });
  if (error) return apiJson({ code: "MEDIA_UPLOAD_COMMIT_FAILED", message: "Media upload could not be committed" }, rpcErrorStatus(error.code));
  const marked = Array.isArray(data) ? data[0] : data;
  if (!marked) return apiJson({ code: "MEDIA_UPLOAD_COMMIT_EMPTY", message: "Media upload response was empty" }, 502);
  return apiJson(parseMediaAssetRow(marked));
}
