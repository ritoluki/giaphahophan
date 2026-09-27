import { idempotencyKeySchema, mediaAssetSchema, mediaUploadInputSchema, mediaUploadIntentSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseMediaAssetRow } from "@/lib/server/media";

export async function POST(request: Request) {
  let input: ReturnType<typeof mediaUploadInputSchema.parse>;
  try { input = mediaUploadInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "INVALID_MEDIA_UPLOAD", message: "Upload payload is invalid" }, 400); }
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid idempotency key is required" }, 428);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("media_upload_intent_idempotent", {
    p_tree_id: input.treeId, p_filename: input.filename, p_mime: input.mimeType, p_size: input.sizeBytes,
    p_sha256: input.sha256, p_purpose: input.purpose, p_visibility: input.visibility,
    p_idempotency_key: idempotencyKey.data, p_request_hash: createRequestHash(input)
  });
  if (error) { console.error("M09_RPC_DEBUG", error.code, error.message); return apiJson({ code: "MEDIA_UPLOAD_INTENT_FAILED", message: "Upload intent was not created" }, rpcErrorStatus(error.code));
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "MEDIA_UPLOAD_INTENT_EMPTY", message: "Upload intent response was empty" }, 502);
  const asset = mediaAssetSchema.parse(parseMediaAssetRow(row));
  const expiresAt = typeof row.expires_at === "string" ? row.expires_at : new Date(Date.now() + 15 * 60_000).toISOString();
  const intent = mediaUploadIntentSchema.parse({
    assetId: asset.id,
    uploadUrl: new URL("/api/v1/media/" + asset.id + "/upload", request.url).toString(),
    expiresAt,
    requiredHeaders: { "Content-Type": input.mimeType }
  });
  return apiJson(intent, 201);
}
