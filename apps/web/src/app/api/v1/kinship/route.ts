import { kinshipQuerySchema, kinshipSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = kinshipQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return apiJson({ code: "INVALID_KINSHIP_QUERY", message: "Kinship endpoints must be valid UUIDs and query flags" }, 400);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("person_kinship", {
    p_from_person_id: parsed.data.from,
    p_to_person_id: parsed.data.to,
    p_include_adoptive: parsed.data.includeAdoptive
  });
  if (error) return apiJson({ code: "KINSHIP_FAILED", message: "Kinship projection is unavailable" }, rpcErrorStatus(error.code));

  const result = kinshipSchema.safeParse(data);
  if (!result.success) return apiJson({ code: "KINSHIP_INVALID_RESPONSE", message: "Kinship projection response was invalid" }, 502);
  return apiJson(result.data);
}