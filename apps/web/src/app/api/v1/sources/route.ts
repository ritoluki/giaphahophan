import { idempotencyKeySchema, sourceInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseSourceRow } from "@/lib/server/sources";

function treeIdFrom(request: Request) {
  const treeId = new URL(request.url).searchParams.get("treeId");
  return /^[0-9a-f-]{36}$/i.test(treeId ?? "") ? treeId : null;
}

export async function GET(request: Request) {
  const treeId = treeIdFrom(request);
  if (!treeId) return apiJson({ code: "TREE_ID_REQUIRED", message: "A valid treeId is required" }, 422);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("sources_get", { p_tree_id: treeId });
  if (error) return apiJson({ code: "SOURCES_LOOKUP_FAILED", message: "Sources are unavailable" }, rpcErrorStatus(error.code));
  return apiJson((Array.isArray(data) ? data : []).map(parseSourceRow));
}

export async function POST(request: Request) {
  const treeId = treeIdFrom(request);
  if (!treeId) return apiJson({ code: "TREE_ID_REQUIRED", message: "A valid treeId is required" }, 422);
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid idempotency key is required" }, 428);
  let input: ReturnType<typeof sourceInputSchema.parse>;
  try { input = sourceInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "SOURCE_INPUT_INVALID", message: "Source input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("source_create_idempotent", {
    p_tree_id: treeId, p_title: input.title, p_kind: input.kind, p_provider_name: input.providerName ?? null,
    p_provenance: input.provenance, p_recorded_date: input.recordedDate ?? null,
    p_original_asset_id: input.originalAssetId ?? null, p_visibility: input.visibility,
    p_rights_note: input.rightsNote ?? null, p_idempotency_key: key.data, p_request_hash: createRequestHash(input)
  });
  if (error) return apiJson({ code: "SOURCE_CREATE_FAILED", message: "Source could not be saved" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "SOURCE_CREATE_EMPTY", message: "Source response was empty" }, 502);
  return apiJson(parseSourceRow(row), 201);
}
