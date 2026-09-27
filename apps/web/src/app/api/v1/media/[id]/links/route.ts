import { idempotencyKeySchema, mediaLinkInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseMediaLinkRow } from "@/lib/server/media";

type RouteContext = { params: Promise<{ id: string }> };

function assetIdFrom(context: RouteContext) {
  return context.params.then(({ id }) => id);
}

export async function GET(request: Request, context: RouteContext) {
  const id = await assetIdFrom(context);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const treeId = new URL(request.url).searchParams.get("treeId");
  if (!/^[0-9a-f-]{36}$/i.test(treeId ?? "")) return apiJson({ code: "TREE_ID_REQUIRED", message: "A valid treeId is required" }, 422);
  const { data, error } = await client.schema("api").rpc("media_links_get", { p_tree_id: treeId, p_asset_id: id });
  if (error) return apiJson({ code: "MEDIA_LINKS_LOOKUP_FAILED", message: "Media links are unavailable" }, rpcErrorStatus(error.code));
  return apiJson((Array.isArray(data) ? data : []).map(parseMediaLinkRow));
}

export async function POST(request: Request, context: RouteContext) {
  const id = await assetIdFrom(context);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiJson({ code: "MEDIA_NOT_FOUND", message: "Media asset was not found" }, 404);
  const treeId = new URL(request.url).searchParams.get("treeId");
  if (!/^[0-9a-f-]{36}$/i.test(treeId ?? "")) return apiJson({ code: "TREE_ID_REQUIRED", message: "A valid treeId is required" }, 422);
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid idempotency key is required" }, 428);
  let input: ReturnType<typeof mediaLinkInputSchema.parse>;
  try { input = mediaLinkInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "MEDIA_LINK_INPUT_INVALID", message: "Media link input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("media_link_create_idempotent", {
    p_tree_id: treeId, p_asset_id: id, p_person_id: input.personId ?? null, p_source_id: input.sourceId ?? null,
    p_content_revision_id: input.contentRevisionId ?? null, p_place_id: input.placeId ?? null, p_caption: input.caption ?? null,
    p_idempotency_key: key.data, p_request_hash: createRequestHash(input)
  });
  if (error) return apiJson({ code: "MEDIA_LINK_CREATE_FAILED", message: "Media link could not be saved" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "MEDIA_LINK_CREATE_EMPTY", message: "Media link response was empty" }, 502);
  return apiJson(parseMediaLinkRow(row), 201);
}