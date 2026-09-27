import { idempotencyKeySchema, reviewInputSchema, scholarshipPublicationSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipPublicationRpcResponse } from "@/app/api/v1/scholarship-response";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipPublicationSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_PUBLICATION_ID", message: "Publication id must be a UUID" }, 400);
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof reviewInputSchema.parse>;
  try { input = reviewInputSchema.parse(await request.json()); } catch { return apiJson({ code: "SCHOLARSHIP_PUBLICATION_REVIEW_INPUT_INVALID", message: "Publication review input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_publication_review", { p_publication_id: parsedId.data, p_decision: input.decision, p_reason: input.reason, p_base_version: input.baseVersion, p_reviewed_snapshot_hash: input.reviewedSnapshotHash, p_idempotency_key: key.data, p_request_hash: createRequestHash({ publicationId: parsedId.data, ...input }) });
  if (error) return apiJson({ code: "SCHOLARSHIP_PUBLICATION_REVIEW_FAILED", message: "Publication review was not accepted" }, rpcErrorStatus(error.code));
  try { const publication = parseScholarshipPublicationRpcResponse(data); if (!publication) return apiJson({ code: "SCHOLARSHIP_PUBLICATION_REVIEW_EMPTY", message: "Publication review response was empty" }, 502); return apiJson(publication); } catch { return apiJson({ code: "SCHOLARSHIP_PUBLICATION_REVIEW_INVALID", message: "Publication review response was invalid" }, 502); }
}