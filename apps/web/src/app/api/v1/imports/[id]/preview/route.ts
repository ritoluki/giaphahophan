import { importPreviewSchema, membershipSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = membershipSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "IMPORT_NOT_FOUND", message: "Import job was not found" }, 404);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("import_preview", { p_job_id: parsedId.data });
  if (error) return apiJson({ code: "IMPORT_PREVIEW_UNAVAILABLE", message: "The authorized import preview is unavailable" }, rpcErrorStatus(error.code));
  try {
    return apiJson(importPreviewSchema.parse(data));
  } catch {
    return apiJson({ code: "IMPORT_PREVIEW_INVALID", message: "The import preview response was invalid" }, 502);
  }
}
