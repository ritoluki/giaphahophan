import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { exportJobSchema, exportRequestSchema } from "@phan/contracts";
import { readPrivateMutation } from "@/lib/server/private-mutations";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

const csrfCookie = "pgp-export-csrf";

export async function GET() {
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "Cần đăng nhập." }, 401);
  const jar = await cookies();
  const prior = jar.get(csrfCookie)?.value;
  const csrfToken = prior && /^[a-f0-9]{64}$/.test(prior) ? prior : randomBytes(32).toString("hex");
  jar.set(csrfCookie, csrfToken, { httpOnly: true, secure: process.env.APP_ENV === "production" || process.env.APP_ENV === "staging", sameSite: "strict", path: "/", maxAge: 3600 });
  return apiJson({ csrfToken });
}

export async function POST(request: Request) {
  const mutation = await readPrivateMutation(request, { csrfCookie, prefix: "EXPORT" });
  if (!mutation.ok) return mutation.response;
  const input = exportRequestSchema.safeParse(mutation.value);
  if (!input.success) return apiJson({ code: "EXPORT_REQUEST_INVALID", message: "Phạm vi hoặc định dạng xuất không hợp lệ." }, 400);
  const dbFormat = { canonical_json: "json", csv: "csv", gedcom_551: "gedcom_551", gedcom_7: "gedcom_7", book_pdf: "pdf", svg: "svg" }[input.data.format];
  const { data, error } = await mutation.client.schema("api").rpc("export_job_create_v1", {
    p_tree: input.data.treeId, p_format: dbFormat, p_scope: input.data.scope, p_purpose: input.data.reason,
    p_key: mutation.key, p_hash: createRequestHash(input.data), p_audience: input.data.audience, p_include_media: input.data.includeMedia,
  });
  if (error) return apiJson({ code: "EXPORT_REQUEST_DENIED", message: "Chưa thể tạo bản xuất. Kiểm tra quyền, MFA, phạm vi và giới hạn thao tác." }, error.code === "22023" ? 422 : error.code === "P0010" ? 429 : rpcErrorStatus(error.code));
  const result = exportJobSchema.safeParse(data);
  return result.success ? apiJson(result.data, 202) : apiJson({ code: "EXPORT_RESPONSE_INVALID", message: "Phản hồi bản xuất không hợp lệ." }, 502);
}
