import { membershipSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseMembershipRow } from "@/lib/server/memberships";

export async function GET() {
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("members");
  if (error) return apiJson({ code: "MEMBERS_LOOKUP_FAILED", message: "Memberships are unavailable" }, rpcErrorStatus(error.code));
  try {
    const rows: unknown[] = Array.isArray(data) ? data : [];
    const memberships = rows.map(parseMembershipRow).map((row) => membershipSchema.parse(row));
    return apiJson(memberships, 200, { page: { nextCursor: null, hasMore: false } });
  } catch {
    return apiJson({ code: "MEMBERS_INVALID_RESPONSE", message: "Membership projection was invalid" }, 502);
  }
}