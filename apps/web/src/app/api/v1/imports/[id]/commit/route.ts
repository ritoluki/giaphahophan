import { importCommitSchema, importJobSchema } from "@phan/contracts";
import { readImportMutation } from "@/lib/server/import-mutations";
import { apiJson, createRequestHash, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const mutation = await readImportMutation(request, (await context.params).id);
  if (!mutation.ok) return mutation.response;
  const input = importCommitSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "IMPORT_COMMIT_INVALID", message: "Bản duyệt hoặc phiên bản không hợp lệ." }, 400);
  const { data, error } = await mutation.client.schema("api").rpc("import_commit", {
    p_job_id: mutation.id, p_base_version: input.data.baseVersion, p_snapshot_hash: input.data.approvedSnapshotHash,
    p_approval_id: input.data.approvalId, p_key: mutation.key, p_hash: createRequestHash({ jobId: mutation.id, ...input.data }),
  });
  if (error) return apiJson({ code: "IMPORT_COMMIT_DENIED", message: "Chưa áp dụng được. Kiểm tra MFA, quyền, bản duyệt và tải lại trạng thái trước khi thử lại." }, error.code === "22023" ? 422 : rpcErrorStatus(error.code));
  const result = importJobSchema.safeParse(data);
  return result.success ? apiJson(result.data, 202) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi áp dụng không hợp lệ." }, 502);
}
