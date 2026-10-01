import { createHash } from "node:crypto";
import { idempotencyKeySchema, importInputSchema, importJobSchema, importTreeOptionSchema } from "@phan/contracts";
import { dryRunCanonicalImport, dryRunStructuredImport } from "@phan/domain";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : null;
}

export async function GET() {
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("import_tree_list");
  if (error) return apiJson({ code: "IMPORT_TREES_UNAVAILABLE", message: "Authorized import trees could not be loaded" }, rpcErrorStatus(error.code));
  try {
    return apiJson(importTreeOptionSchema.array().max(100).parse(data));
  } catch {
    return apiJson({ code: "IMPORT_TREES_INVALID", message: "Authorized import tree response was invalid" }, 502);
  }
}

async function readBoundedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge: boolean }> {
  const limit = 16 * 1024;
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, tooLarge: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

export async function POST(request: Request) {
  let input: ReturnType<typeof importInputSchema.parse>;
  const body = await readBoundedJson(request);
  if (!body.ok && body.tooLarge) return apiJson({ code: "IMPORT_REQUEST_TOO_LARGE", message: "Import request metadata exceeds the size limit" }, 413);
  try { input = importInputSchema.parse(body.ok ? body.value : undefined); }
  catch { return apiJson({ code: "INVALID_IMPORT", message: "Import request is invalid" }, 400); }
  const idempotency = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotency.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid idempotency key is required" }, 428);
  if (input.mode !== "demo") return apiJson({ code: "REAL_IMPORT_REQUIRES_H5", message: "Real-data imports require an approved H5 scope" }, 403);
  if (input.format !== "canonical_json" && input.format !== "csv") return apiJson({ code: "IMPORT_FORMAT_NOT_READY", message: "This import format is not available in this phase" }, 422);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data: sourceData, error: sourceError } = await client.schema("api").rpc("import_source_context", { p_asset_id: input.assetId });
  if (sourceError) return apiJson({ code: "IMPORT_SOURCE_UNAVAILABLE", message: "The import source is unavailable" }, rpcErrorStatus(sourceError.code));
  const source = firstRow(sourceData);
  const sourceSize = typeof source?.size_bytes === "number" ? source.size_bytes
    : typeof source?.size_bytes === "string" && /^\d+$/.test(source.size_bytes) ? Number(source.size_bytes) : NaN;
  if (!source || source.id !== input.assetId || source.tree_id !== input.treeId ||
      typeof source.object_path !== "string" || typeof source.sha256 !== "string" ||
      !Number.isSafeInteger(sourceSize) || sourceSize < 1 || sourceSize > MAX_IMPORT_BYTES) {
    return apiJson({ code: "IMPORT_SOURCE_INVALID", message: "The import source is not eligible" }, 422);
  }
  const mimeType = typeof source.mime_type === "string" ? source.mime_type.split(";")[0]?.trim().toLowerCase() : "";
  if (input.format === "csv" ? mimeType !== "text/csv" : mimeType !== "application/json") {
    return apiJson({ code: "IMPORT_SOURCE_FORMAT_MISMATCH", message: "The source media type does not match the selected format" }, 422);
  }

  const { data: file, error: downloadError } = await client.storage.from("family-assets").download(source.object_path);
  if (downloadError || !file) return apiJson({ code: "IMPORT_SOURCE_READ_FAILED", message: "The import source could not be read" }, 422);
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== sourceSize || checksum !== source.sha256) {
    return apiJson({ code: "IMPORT_SOURCE_CHECKSUM_MISMATCH", message: "The import source checksum did not match" }, 409);
  }

  let sourceDocument: unknown;
  let csvText: string | null = null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    if (input.format === "csv") csvText = text;
    else sourceDocument = JSON.parse(text);
  } catch {
    return apiJson({ code: input.format === "csv" ? "IMPORT_CSV_ENCODING_INVALID" : "IMPORT_JSON_INVALID", message: "The source is not valid UTF-8 structured data" }, 422);
  }
  const preview = input.mapping
    ? dryRunStructuredImport(input.format === "csv" ? csvText : sourceDocument, input.mapping, input.format === "csv" ? "csv" : "json")
    : dryRunCanonicalImport(sourceDocument, input.mappingVersion);
  if (!preview) return apiJson({ code: "IMPORT_SCHEMA_INVALID", message: "The canonical JSON envelope is invalid" }, 422);

  const { data: jobData, error: jobError } = await client.schema("api").rpc("import_create", {
    p_tree_id: input.treeId, p_asset_id: input.assetId, p_format: input.format,
    p_source_namespace: input.sourceNamespace, p_mapping_version: input.mappingVersion, p_mode: input.mode,
    p_idempotency_key: idempotency.data, p_request_hash: createRequestHash(input)
  });
  if (jobError) return apiJson({ code: "IMPORT_CREATE_FAILED", message: "The import job was not created" }, rpcErrorStatus(jobError.code));
  const job = firstRow(jobData);
  if (!job || typeof job.id !== "string") return apiJson({ code: "IMPORT_CREATE_EMPTY", message: "The import job response was empty" }, 502);

  if (input.mapping) {
    const { error: mappingError } = await client.schema("api").rpc("import_mapping_attach", {
      p_job_id: job.id, p_mapping: input.mapping
    });
    if (mappingError) return apiJson({ code: "IMPORT_MAPPING_FAILED", message: "The versioned mapping could not be saved" }, rpcErrorStatus(mappingError.code));
  }

  const { data: stagedData, error: stagedError } = await client.schema("api").rpc("import_stage_rows", {
    p_job_id: job.id, p_rows: preview.rows, p_warnings: preview.warnings
  });
  if (stagedError) return apiJson({ code: "IMPORT_STAGING_FAILED", message: "The dry-run could not be saved" }, rpcErrorStatus(stagedError.code));
  const staged = firstRow(stagedData);
  if (!staged) return apiJson({ code: "IMPORT_STAGING_EMPTY", message: "The dry-run response was empty" }, 502);

  try {
    return apiJson(importJobSchema.parse({
      id: job.id, version: staged.version, kind: "import", status: staged.status,
      counters: { processed: preview.rows.length, succeeded: preview.valid, failed: preview.invalid, skipped: preview.possibleDuplicates },
      warnings: preview.warnings, errorCode: null, expiresAt: null, treeId: job.tree_id,
      sourceAssetId: job.source_asset_id, fileSha256: checksum, format: job.format,
      sourceNamespace: job.source_namespace, mappingVersion: job.mapping_version, classification: job.classification
    }), 202);
  } catch {
    return apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "The import response was invalid" }, 502);
  }
}
