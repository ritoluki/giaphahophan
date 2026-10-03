import { importRelationshipMappingResultSchema, importRelationshipMappingSchema, importRelationshipRowsPageSchema, importRelationshipRowsQuerySchema, membershipSchema } from "@phan/contracts";
import { readImportMutation } from "@/lib/server/import-mutations";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = membershipSchema.shape.id.safeParse((await context.params).id);
  const params = new URL(request.url).searchParams;
  const query = importRelationshipRowsQuerySchema.safeParse({ baseVersion: params.get("baseVersion"), after: params.get("after") ?? 0 });
  if (!id.success || !query.success || Array.from(params.keys()).some((key) => !["baseVersion", "after"].includes(key))
      || params.getAll("baseVersion").length !== 1 || params.getAll("after").length > 1) return apiJson({ code: "IMPORT_RELATIONSHIP_QUERY_INVALID", message: "Cần phiên bản và vị trí quan hệ hợp lệ." }, 400);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "Cần đăng nhập." }, 401);
  const { data, error } = await client.schema("api").rpc("import_relationship_rows", {
    p_job_id: id.data, p_base_version: query.data.baseVersion, p_after: query.data.after,
  });
  if (error) return apiJson({ code: "IMPORT_RELATIONSHIP_UNAVAILABLE", message: "Không tải được quan hệ. Kiểm tra quyền hoặc tải lại bản xem trước đã đổi phiên bản." }, rpcErrorStatus(error.code));
  const result = importRelationshipRowsPageSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi quan hệ không hợp lệ." }, 502);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const mutation = await readImportMutation(request, (await context.params).id);
  if (!mutation.ok) return mutation.response;
  const input = importRelationshipMappingSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "IMPORT_RELATIONSHIP_INVALID", message: "Cần mapping quan hệ rõ ràng và bản xem trước còn hiệu lực." }, 400);
  const { data, error } = await mutation.client.schema("api").rpc("import_relationship_mapping_save", {
    p_job_id: mutation.id, p_base_version: input.data.baseVersion, p_snapshot_hash: input.data.snapshotHash,
    p_mapping: input.data, p_key: mutation.key,
    p_hash: createRequestHash({ jobId: mutation.id, ...input.data }),
  });
  if (error) return apiJson({ code: "IMPORT_RELATIONSHIP_DENIED", message: "Chưa thể lưu mapping. Kiểm tra quyền, MFA và tải lại bản xem trước nếu phiên bản đã đổi." }, error.code === "22023" ? 422 : rpcErrorStatus(error.code));
  const result = importRelationshipMappingResultSchema.safeParse(data);
  return result.success ? apiJson(result.data) : apiJson({ code: "IMPORT_RESPONSE_INVALID", message: "Phản hồi mapping không hợp lệ." }, 502);
}
