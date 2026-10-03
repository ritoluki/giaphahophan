import { importPreviewSchema, importRowDecisionSchema, importRowsPageSchema, importRowsQuerySchema, membershipSchema } from "@phan/contracts";
import { readImportMutation } from "@/lib/server/import-mutations";
import { apiJson, createRequestHash, rpcErrorStatus, createRequestSupabaseClient, getVerifiedUser } from "@/lib/server/supabase-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = membershipSchema.shape.id.safeParse((await context.params).id);
  const params = new URL(request.url).searchParams;
  const query = importRowsQuerySchema.safeParse({ baseVersion: params.get("baseVersion"), after: params.get("after") ?? 0 });
  if (!id.success || !query.success || Array.from(params.keys()).some((key) => !["baseVersion", "after"].includes(key))
      || params.getAll("baseVersion").length !== 1 || params.getAll("after").length > 1) return apiJson({ code: "IMPORT_ROWS_INVALID", message: "Cần phiên bản và vị trí dòng hợp lệ." }, 400);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "Cần đăng nhập." }, 401);
  const { data, error } = await client.schema("api").rpc("import_rows_page", { p_job_id: id.data, p_base_version: query.data.baseVersion, p_after: query.data.after });
  if (error) return apiJson({ code: "IMPORT_ROWS_DENIED", message: "Không tải được dòng. Kiểm tra quyền và tải lại bản xem trước nếu phiên bản đã đổi." }, rpcErrorStatus(error.code));
  const result = importRowsPageSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi dòng không hợp lệ." }, 502);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const mutation = await readImportMutation(request, (await context.params).id);
  if (!mutation.ok) return mutation.response;
  const input = importRowDecisionSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "IMPORT_ROW_DECISION_INVALID", message: "Cần số dòng, lý do và bản xem trước còn hiệu lực." }, 400);
  const { data, error } = await mutation.client.schema("api").rpc("import_row_decide", {
    p_job_id: mutation.id, p_base_version: input.data.baseVersion, p_snapshot_hash: input.data.snapshotHash,
    p_row_number: input.data.rowNumber, p_excluded: input.data.excluded, p_reason: input.data.reason,
    p_key: mutation.key, p_hash: createRequestHash({ jobId: mutation.id, ...input.data }),
  });
  if (error) return apiJson({ code: "IMPORT_ROW_DECISION_DENIED", message: "Chưa thể cập nhật dòng. Kiểm tra quyền, MFA và tải lại bản xem trước; batch đã áp dụng không thể sửa ở bước này." }, error.code === "22023" ? 422 : rpcErrorStatus(error.code));
  const result = importPreviewSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi quyết định dòng không hợp lệ." }, 502);
}
