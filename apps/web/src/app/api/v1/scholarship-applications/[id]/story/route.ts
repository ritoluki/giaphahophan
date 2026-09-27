import { idempotencyKeySchema, scholarshipApplicationSchema, scholarshipPublicationInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipPublicationRpcResponse } from "@/app/api/v1/scholarship-response";
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipApplicationSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_APPLICATION_ID", message: "Application id must be a UUID" }, 400);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_publication_list", { p_application_id: parsedId.data });
  if (error) return apiJson({ code: "SCHOLARSHIP_PUBLICATION_LOOKUP_FAILED", message: "Publication request is unavailable" }, rpcErrorStatus(error.code));
  try { const publication = (Array.isArray(data) ? data : []).map(parseScholarshipPublicationRpcResponse); if (publication.some((item) => !item)) return apiJson({ code: "SCHOLARSHIP_PUBLICATION_INVALID", message: "Publication response was invalid" }, 502); return apiJson(publication, 200, { page: { nextCursor: null, hasMore: false } }); } catch { return apiJson({ code: "SCHOLARSHIP_PUBLICATION_INVALID", message: "Publication response was invalid" }, 502); }
}
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipApplicationSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_APPLICATION_ID", message: "Application id must be a UUID" }, 400);
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof scholarshipPublicationInputSchema.parse>;
  try { input = scholarshipPublicationInputSchema.parse({ ...(await request.json()), applicationId: parsedId.data }); } catch { return apiJson({ code: "SCHOLARSHIP_PUBLICATION_INPUT_INVALID", message: "Publication input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_publication_create", { p_application_id: parsedId.data, p_title: input.title, p_story: input.story, p_source_asset_id: input.sourceAssetId, p_idempotency_key: key.data, p_request_hash: createRequestHash(input) });
  if (error) return apiJson({ code: "SCHOLARSHIP_PUBLICATION_CREATE_FAILED", message: "Publication request could not be saved" }, rpcErrorStatus(error.code));
  try { const publication = parseScholarshipPublicationRpcResponse(data); if (!publication) return apiJson({ code: "SCHOLARSHIP_PUBLICATION_EMPTY", message: "Publication response was empty" }, 502); return apiJson(publication, 201); } catch { return apiJson({ code: "SCHOLARSHIP_PUBLICATION_INVALID", message: "Publication response was invalid" }, 502); }
}