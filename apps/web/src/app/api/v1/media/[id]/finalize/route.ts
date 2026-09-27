import { idempotencyKeySchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { inspectMediaBytes, parseMediaAssetRow, type MediaUploadContext } from "@/lib/server/media";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid idempotency key is required" }, 428);
  const client = await createRequestSupabaseClient();
  const user = await getVerifiedUser(client);
  if (!user) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data: contextData, error: contextError } = await client.schema("api").rpc("media_asset_upload_context", { p_asset_id: id });
  if (contextError) return apiJson({ code: "MEDIA_CONTEXT_FAILED", message: "Media asset is unavailable" }, rpcErrorStatus(contextError.code));
  const contextRow = Array.isArray(contextData) ? contextData[0] : contextData;
  if (!contextRow) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  const uploadContext = { ...(contextRow as unknown as Omit<MediaUploadContext, "object_path">), object_path: user.id + "/" + id + "/original" } satisfies MediaUploadContext;
  const { data: file, error: storageError } = await client.storage.from("family-assets").download(uploadContext.object_path);
  let actualSize = 0;
  let actualSha256 = "0".repeat(64);
  let scanStatus = "failed";
  let scanCode = "STORAGE_READ_FAILED";
  if (!storageError && file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    actualSize = bytes.byteLength;
    const inspected = inspectMediaBytes(bytes, uploadContext.declared_mime, uploadContext.expected_sha256);
    actualSha256 = inspected.actualSha256;
    scanStatus = inspected.ok ? "passed" : "failed";
    scanCode = inspected.code;
  }
  const requestPayload = { id, actualSize, actualSha256, scanStatus, scanCode };
  const { data, error } = await client.schema("api").rpc("media_finalize_idempotent", {
    p_asset_id: id, p_actual_size: actualSize, p_actual_mime: uploadContext.declared_mime,
    p_actual_sha256: actualSha256, p_scan_status: scanStatus, p_scan_code: scanCode,
    p_idempotency_key: idempotencyKey.data, p_request_hash: createRequestHash(requestPayload)
  });
  if (error) return apiJson({ code: "MEDIA_FINALIZE_FAILED", message: "Media finalization failed" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "MEDIA_FINALIZE_EMPTY", message: "Media finalization response was empty" }, 502);
  return apiJson(parseMediaAssetRow(row), 202);
}
