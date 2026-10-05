import { exportProjectionSchema, membershipSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = membershipSchema.shape.id.safeParse((await context.params).id);
  if (!id.success) return apiJson({ code: "EXPORT_UNAVAILABLE", message: "Bản xuất không khả dụng." }, 404);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "Cần đăng nhập." }, 401);
  const { data, error } = await client.schema("api").rpc("export_projection", { p_id: id.data });
  if (error) return apiJson({ code: "EXPORT_PREVIEW_DENIED", message: "Không thể xem bản xuất. Kiểm tra quyền, phạm vi và thời hạn." }, error.code === "54000" ? 422 : error.code === "57014" || error.code === "55P03" ? 503 : rpcErrorStatus(error.code));
  const projection = exportProjectionSchema.safeParse(data);
  return projection.success ? apiJson(projection.data) : apiJson({ code: "EXPORT_PROJECTION_INVALID", message: "Dữ liệu vượt giới hạn hoặc không đúng hợp đồng xuất; chưa tạo file." }, 502);
}
