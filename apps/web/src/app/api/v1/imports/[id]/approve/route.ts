import { importReviewInputSchema, importReviewStateSchema } from "@phan/contracts";
import { readImportMutation } from "@/lib/server/import-mutations";
import { apiJson, createRequestHash, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const mutation = await readImportMutation(request, (await context.params).id);
  if (!mutation.ok) return mutation.response;
  const input = importReviewInputSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "IMPORT_REVIEW_INVALID", message: "Phiên bản hoặc bản xem trước không hợp lệ." }, 400);
  const { data, error } = await mutation.client.schema("api").rpc("import_approve", {
    p_job_id: mutation.id, p_base_version: input.data.baseVersion, p_snapshot_hash: input.data.snapshotHash,
    p_key: mutation.key, p_hash: createRequestHash({ jobId: mutation.id, ...input.data }),
  });
  if (error) return apiJson({ code: "IMPORT_REVIEW_DENIED", message: "Chưa thể duyệt: cần người khác người tạo, MFA, quyền nhập liệu và bản xem trước còn hiệu lực." }, error.code === "22023" ? 422 : rpcErrorStatus(error.code));
  const result = importReviewStateSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi duyệt không hợp lệ." }, 502);
}
