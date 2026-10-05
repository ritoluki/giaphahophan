import { importCompensationInputSchema, importReviewStateSchema } from "@phan/contracts";
import { readImportMutation } from "@/lib/server/import-mutations";
import { apiJson, createRequestHash, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const mutation = await readImportMutation(request, (await context.params).id);
  if (!mutation.ok) return mutation.response;
  const input = importCompensationInputSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "IMPORT_COMPENSATION_INVALID", message: "Yêu cầu hoàn tác không hợp lệ." }, 400);
  const action = input.data;
  const { data, error } = await mutation.client.schema("api").rpc("import_compensation", {
    p_job_id: mutation.id, p_action: action.action, p_base_version: action.baseVersion,
    p_review_id: action.action === "request" ? null : action.reviewId,
    p_review_version: action.action === "request" ? null : action.reviewVersion,
    p_reason: action.action === "request" ? action.reason : null, p_key: mutation.key,
    p_hash: createRequestHash({ jobId: mutation.id, ...action }),
  });
  if (error) return apiJson({ code: "IMPORT_COMPENSATION_DENIED", message: "Chưa thể hoàn tác. Cần bản duyệt riêng của người khác; hồ sơ đã sửa hoặc có liên kết mới sẽ được giữ nguyên. Tải lại trạng thái trước khi thử lại." },
    error.code === "22023" ? 422 : error.code === "40P01" ? 409 : error.code === "57014" || error.code === "55P03" ? 503 : rpcErrorStatus(error.code));
  const result = importReviewStateSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi hoàn tác không hợp lệ." }, 502);
}
