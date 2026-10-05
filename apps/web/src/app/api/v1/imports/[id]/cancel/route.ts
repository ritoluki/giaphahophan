import { importCancelSchema, importReviewStateSchema } from "@phan/contracts";
import { readImportMutation } from "@/lib/server/import-mutations";
import { apiJson, createRequestHash, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const mutation = await readImportMutation(request, (await context.params).id);
  if (!mutation.ok) return mutation.response;
  const input = importCancelSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "IMPORT_CANCEL_INVALID", message: "Lý do hủy hoặc phiên bản bản nhập không hợp lệ." }, 400);
  const { data, error } = await mutation.client.schema("api").rpc("import_cancel", {
    p_job_id: mutation.id,
    p_expected_version: input.data.baseVersion,
    p_reason: input.data.reason,
    p_idempotency_key: mutation.key,
    p_request_hash: createRequestHash({ jobId: mutation.id, ...input.data }),
  });
  if (error) return apiJson({ code: "IMPORT_CANCEL_DENIED", message: "Chưa thể hủy. Có thể bản nhập đã thay đổi hoặc đã ghi dữ liệu; hãy tải lại trạng thái." }, rpcErrorStatus(error.code));
  const result = importReviewStateSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi hủy bản nhập không hợp lệ." }, 502);
}
