import { exportJobSchema, membershipSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = membershipSchema.shape.id.safeParse((await context.params).id);
  if (!id.success) return apiJson({ code: "EXPORT_UNAVAILABLE", message: "Bản xuất không khả dụng." }, 404);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "Cần đăng nhập." }, 401);
  const { data, error } = await client.schema("api").rpc("export_job_state", { p_id: id.data });
  if (error) return apiJson({ code: "EXPORT_UNAVAILABLE", message: "Bản xuất hết hạn hoặc quyền/phạm vi đã thay đổi." }, rpcErrorStatus(error.code));
  const result = exportJobSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "EXPORT_RESPONSE_INVALID", message: "Phản hồi bản xuất không hợp lệ." }, 502);
}
