import { citationInputSchema, idempotencyKeySchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseCitationRow } from "@/lib/server/sources";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const treeId = new URL(request.url).searchParams.get("treeId");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(treeId ?? "")) return apiJson({ code: "SOURCE_NOT_FOUND", message: "Source was not found" }, 404);
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid idempotency key is required" }, 428);
  let input: ReturnType<typeof citationInputSchema.parse>;
  try { input = citationInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "CITATION_INPUT_INVALID", message: "Citation input is invalid" }, 422); }
  if (input.sourceId !== id) return apiJson({ code: "CITATION_SOURCE_MISMATCH", message: "Citation source does not match the route" }, 422);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("citation_create_idempotent", {
    p_tree_id: treeId, p_source_id: id, p_person_id: input.personId ?? null, p_fact_id: input.factId ?? null,
    p_parent_link_id: input.parentLinkId ?? null, p_union_id: input.unionId ?? null, p_locator: input.locator,
    p_quoted_text: input.quotedText ?? null, p_confidence: input.confidence ?? null,
    p_idempotency_key: key.data, p_request_hash: createRequestHash(input)
  });
  if (error) return apiJson({ code: "CITATION_CREATE_FAILED", message: "Citation could not be saved" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "CITATION_CREATE_EMPTY", message: "Citation response was empty" }, 502);
  return apiJson(parseCitationRow(row), 201);
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const treeId = new URL(request.url).searchParams.get("treeId");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(treeId ?? "")) return apiJson({ code: "SOURCE_NOT_FOUND", message: "Source was not found" }, 404);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("citations_get", { p_tree_id: treeId, p_source_id: id });
  if (error) return apiJson({ code: "CITATIONS_LOOKUP_FAILED", message: "Citations are unavailable" }, rpcErrorStatus(error.code));
  return apiJson((Array.isArray(data) ? data : []).map(parseCitationRow));
}
