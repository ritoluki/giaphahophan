import { importChunkApplySchema, importReviewStateSchema } from "@phan/contracts";
import { readImportMutation } from "@/lib/server/import-mutations";
import { apiJson, createRequestHash, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const mutation = await readImportMutation(request, (await context.params).id);
  if (!mutation.ok) return mutation.response;
  const input = importChunkApplySchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "IMPORT_CHUNK_INVALID", message: "Lượt nhập hoặc bản duyệt không hợp lệ." }, 400);
  const { data, error } = await mutation.client.schema("api").rpc("import_chunk_apply", {
    p_job_id: mutation.id, p_base_version: input.data.baseVersion, p_snapshot_hash: input.data.approvedSnapshotHash,
    p_approval_id: input.data.approvalId, p_sequence: input.data.sequence, p_key: mutation.key,
    p_hash: createRequestHash({ jobId: mutation.id, ...input.data }),
  });
  if (error) return apiJson({ code: "IMPORT_CHUNK_DENIED", message: "Chưa lưu được lượt này. Các lượt đã lưu vẫn được giữ; tải lại trạng thái để kiểm tra bản duyệt, quyền và thay đổi hồ sơ." }, error.code === "22023" ? 422 : rpcErrorStatus(error.code));
  const result = importReviewStateSchema.safeParse(data);
  return result.success ? apiJson(result.data, 202) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi lượt nhập không hợp lệ." }, 502);
}
