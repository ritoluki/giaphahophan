import { scholarshipProgramSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipStoryRpcResponse } from "@/app/api/v1/scholarship-response";
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipProgramSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_SCHOLARSHIP_PROGRAM_ID", message: "Program id must be a UUID" }, 400);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_program_stories", { p_program_id: parsedId.data });
  if (error) return apiJson({ code: "SCHOLARSHIP_STORIES_LOOKUP_FAILED", message: "Approved stories are unavailable" }, rpcErrorStatus(error.code));
  try { const stories = (Array.isArray(data) ? data : []).map(parseScholarshipStoryRpcResponse); if (stories.some((story) => !story)) return apiJson({ code: "SCHOLARSHIP_STORIES_INVALID", message: "Approved story response was invalid" }, 502); return apiJson(stories, 200, { page: { nextCursor: null, hasMore: false } }); } catch { return apiJson({ code: "SCHOLARSHIP_STORIES_INVALID", message: "Approved story response was invalid" }, 502); }
}