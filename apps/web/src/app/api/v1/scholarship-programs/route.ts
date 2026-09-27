import { idempotencyKeySchema, scholarshipProgramInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipProgramRpcResponse } from "../scholarship-response";

function treeIdFrom(request: Request) {
  const treeId = new URL(request.url).searchParams.get("treeId");
  return /^[0-9a-f-]{36}$/i.test(treeId ?? "") ? treeId : null;
}

export async function GET(request: Request) {
  const treeId = treeIdFrom(request);
  if (!treeId) return apiJson({ code: "TREE_ID_REQUIRED", message: "A valid treeId is required" }, 422);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_program_list", { p_tree_id: treeId });
  if (error) return apiJson({ code: "SCHOLARSHIP_PROGRAMS_LOOKUP_FAILED", message: "Scholarship programs are unavailable" }, rpcErrorStatus(error.code));
  try {
    const programs = (Array.isArray(data) ? data : []).map(parseScholarshipProgramRpcResponse);
    if (programs.some((program) => !program)) return apiJson({ code: "SCHOLARSHIP_PROGRAMS_INVALID", message: "Scholarship program response was invalid" }, 502);
    return apiJson(programs, 200, { page: { nextCursor: null, hasMore: false } });
  } catch { return apiJson({ code: "SCHOLARSHIP_PROGRAMS_INVALID", message: "Scholarship program response was invalid" }, 502); }
}

export async function POST(request: Request) {
  const treeId = treeIdFrom(request);
  if (!treeId) return apiJson({ code: "TREE_ID_REQUIRED", message: "A valid treeId is required" }, 422);
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);
  let input: ReturnType<typeof scholarshipProgramInputSchema.parse>;
  try { input = scholarshipProgramInputSchema.parse(await request.json()); }
  catch { return apiJson({ code: "SCHOLARSHIP_PROGRAM_INPUT_INVALID", message: "Scholarship program input is invalid" }, 422); }
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_program_create", {
    p_tree_id: treeId, p_fund_id: input.fundId, p_title: input.title, p_criteria: input.criteria, p_closes_at: input.closesAt, p_status: input.status,
    p_idempotency_key: idempotencyKey.data, p_request_hash: createRequestHash({ treeId, ...input }),
  });
  if (error) return apiJson({ code: "SCHOLARSHIP_PROGRAM_CREATE_FAILED", message: "Scholarship program could not be saved" }, rpcErrorStatus(error.code));
  try {
    const program = parseScholarshipProgramRpcResponse(data);
    if (!program) return apiJson({ code: "SCHOLARSHIP_PROGRAM_EMPTY_RESPONSE", message: "Scholarship program response was empty" }, 502);
    return apiJson(program, 201);
  } catch { return apiJson({ code: "SCHOLARSHIP_PROGRAM_INVALID_RESPONSE", message: "Scholarship program response was invalid" }, 502); }
}