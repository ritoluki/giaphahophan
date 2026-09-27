import { idempotencyKeySchema, scholarshipApplicationInputSchema, scholarshipProgramSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipApplicationRpcResponse } from "@/app/api/v1/scholarship-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipProgramSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_PROGRAM_ID", message: "Program id must be a UUID" }, 400);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_application_list", { p_program_id: parsedId.data });
  if (error) return apiJson({ code: "SCHOLARSHIP_APPLICATIONS_LOOKUP_FAILED", message: "Scholarship applications are unavailable" }, rpcErrorStatus(error.code));
  try {
    const applications = (Array.isArray(data) ? data : []).map(parseScholarshipApplicationRpcResponse);
    if (applications.some((application) => !application)) return apiJson({ code: "SCHOLARSHIP_APPLICATIONS_INVALID", message: "Scholarship application response was invalid" }, 502);
    return apiJson(applications, 200, { page: { nextCursor: null, hasMore: false } });
  } catch { return apiJson({ code: "SCHOLARSHIP_APPLICATIONS_INVALID", message: "Scholarship application response was invalid" }, 502); }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipProgramSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_PROGRAM_ID", message: "Program id must be a UUID" }, 400);
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof scholarshipApplicationInputSchema.parse>;
  try { input = scholarshipApplicationInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "SCHOLARSHIP_APPLICATION_INPUT_INVALID", message: "Scholarship application input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_application_create", {
    p_program_id: parsedId.data, p_person_id: input.personId, p_statement: input.statement, p_evidence_asset_id: input.evidenceAssetId, p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ programId: parsedId.data, ...input }),
  });
  if (error) return apiJson({ code: "SCHOLARSHIP_APPLICATION_CREATE_FAILED", message: "Scholarship application could not be saved" }, rpcErrorStatus(error.code));
  try {
    const application = parseScholarshipApplicationRpcResponse(data);
    if (!application) return apiJson({ code: "SCHOLARSHIP_APPLICATION_EMPTY_RESPONSE", message: "Scholarship application response was empty" }, 502);
    return apiJson(application, 201);
  } catch { return apiJson({ code: "SCHOLARSHIP_APPLICATION_INVALID_RESPONSE", message: "Scholarship application response was invalid" }, 502); }
}