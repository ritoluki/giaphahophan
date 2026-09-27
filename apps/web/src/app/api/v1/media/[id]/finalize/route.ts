import { idempotencyKeySchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { createImageDerivatives } from "@/lib/server/media-derivatives";
import { inspectMediaBytes, parseMediaAssetRow, type MediaUploadContext } from "@/lib/server/media";

type RouteContext = { params: Promise<{ id: string }> };

type MediaClient = Awaited<ReturnType<typeof createRequestSupabaseClient>>;

async function persistImageDerivatives(client: MediaClient, bytes: Uint8Array, actorId: string, assetId: string) {
  const started = await client.schema("api").rpc("media_asset_processing_start", { p_asset_id: assetId });
  if (started.error) throw new Error("DERIVATIVE_START_FAILED");
  const generated = await createImageDerivatives(bytes, actorId, assetId);
  for (const [variant, buffer] of generated.buffers) {
    const { error } = await client.storage.from("family-assets").upload(
      `${actorId}/${assetId}/derivatives/${variant}.webp`,
      buffer,
      { contentType: "image/webp", cacheControl: "no-store", upsert: true }
    );
    if (error) throw new Error("DERIVATIVE_STORAGE_FAILED");
  }
  const committed = await client.schema("api").rpc("media_asset_derivatives_commit", {
    p_asset_id: assetId,
    p_manifest: generated.manifest
  });
  if (committed.error) throw new Error("DERIVATIVE_COMMIT_FAILED");
  const row = Array.isArray(committed.data) ? committed.data[0] : committed.data;
  if (!row) throw new Error("DERIVATIVE_COMMIT_EMPTY");
  return parseMediaAssetRow(row);
}

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
  let originalBytes: Uint8Array | undefined;
  if (!storageError && file) {
    originalBytes = new Uint8Array(await file.arrayBuffer());
    actualSize = originalBytes.byteLength;
    const inspected = inspectMediaBytes(originalBytes, uploadContext.declared_mime, uploadContext.expected_sha256);
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
  const asset = parseMediaAssetRow(row);
  if (asset.state === "ready" && uploadContext.declared_mime.startsWith("image/") && originalBytes && uploadContext.created_by === user.id) {
    try {
      return apiJson(await persistImageDerivatives(client, originalBytes, user.id, id), 202);
    } catch {
      await client.schema("api").rpc("media_asset_derivatives_failed", { p_asset_id: id, p_reason: "DERIVATIVE_PROCESSING_FAILED" });
      return apiJson({ code: "MEDIA_DERIVATIVE_FAILED", message: "Image derivatives could not be prepared" }, 503);
    }
  }
  return apiJson(asset, 202);
}
