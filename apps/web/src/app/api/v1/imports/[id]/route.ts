import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { importReviewStateSchema, membershipSchema } from "@phan/contracts";
import { IMPORT_CSRF_COOKIE } from "@/lib/server/import-mutations";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = membershipSchema.shape.id.safeParse((await context.params).id);
  if (!id.success) return apiJson({ code: "IMPORT_NOT_FOUND", message: "Không tìm thấy bản nhập." }, 404);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "Cần đăng nhập." }, 401);
  const { data, error } = await client.schema("api").rpc("import_job_state", { p_job_id: id.data });
  if (error) return apiJson({ code: "IMPORT_STATE_UNAVAILABLE", message: "Không thể đọc bản nhập được cấp quyền." }, rpcErrorStatus(error.code));
  const result = importReviewStateSchema.safeParse(data);
  if (!result.success) return apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi bản nhập không hợp lệ." }, 502);
  const csrfToken = randomBytes(32).toString("hex");
  (await cookies()).set(IMPORT_CSRF_COOKIE, csrfToken, { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/api/v1/imports", maxAge: 1800 });
  return apiJson(result.data, 200, { meta: { requestId: crypto.randomUUID(), csrfToken } });
}
