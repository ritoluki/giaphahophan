import { exportCancelSchema, exportJobSchema, idempotencyKeySchema } from "@phan/contracts";
import { readPrivateMutation } from "@/lib/server/private-mutations";
import { apiJson, createRequestHash, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = idempotencyKeySchema.safeParse((await context.params).id);
  if (!id.success) return apiJson({ code: "EXPORT_UNAVAILABLE", message: "Bản xuất không khả dụng." }, 404);
  const mutation = await readPrivateMutation(request, { csrfCookie: "pgp-export-csrf", prefix: "EXPORT" });
  if (!mutation.ok) return mutation.response;
  const input = exportCancelSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "EXPORT_CANCEL_INVALID", message: "Lý do hủy hoặc phiên bản bản xuất không hợp lệ." }, 400);
  const { data, error } = await mutation.client.schema("api").rpc("export_job_cancel", {
    p_id: id.data, p_version: input.data.baseVersion, p_reason: input.data.reason,
    p_key: mutation.key, p_hash: createRequestHash({ jobId: id.data, ...input.data }),
  });
  if (error) return apiJson({ code: "EXPORT_CANCEL_DENIED", message: "Chưa thể hủy. Hãy kiểm tra quyền và tải lại trạng thái bản xuất." }, error.code === "57014" || error.code === "55P03" ? 503 : error.code === "22023" ? 422 : rpcErrorStatus(error.code));
  const result = exportJobSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "EXPORT_RESPONSE_INVALID", message: "Phản hồi hủy bản xuất không hợp lệ." }, 502);
}
