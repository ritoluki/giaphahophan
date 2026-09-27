import { idempotencyKeySchema, reviewInputSchema, scholarshipApplicationSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipApplicationRpcResponse } from "@/app/api/v1/scholarship-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipApplicationSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_APPLICATION_ID", message: "Application id must be a UUID" }, 400);
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof reviewInputSchema.parse>;
  try { input = reviewInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "SCHOLARSHIP_REVIEW_INPUT_INVALID", message: "Scholarship review input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_application_review", {
    p_application_id: parsedId.data, p_decision: input.decision, p_reason: input.reason, p_base_version: input.baseVersion, p_reviewed_snapshot_hash: input.reviewedSnapshotHash,
    p_idempotency_key: idempotencyKey.data, p_request_hash: createRequestHash({ applicationId: parsedId.data, ...input }),
  });
  if (error) return apiJson({ code: "SCHOLARSHIP_REVIEW_FAILED", message: "Scholarship review was not accepted" }, rpcErrorStatus(error.code));
  try {
    const application = parseScholarshipApplicationRpcResponse(data);
    if (!application) return apiJson({ code: "SCHOLARSHIP_REVIEW_EMPTY_RESPONSE", message: "Scholarship review response was empty" }, 502);
    return apiJson(application);
  } catch { return apiJson({ code: "SCHOLARSHIP_REVIEW_INVALID_RESPONSE", message: "Scholarship review response was invalid" }, 502); }
}