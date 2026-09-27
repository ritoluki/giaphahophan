import { idempotencyKeySchema, memberInputSchema, membershipSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseMembershipRow } from "@/lib/server/memberships";

type RouteContext = { params: Promise<{ id: string }> };

function readBaseVersion(request: Request) {
  const raw = request.headers.get("If-Match")?.trim();
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  return Number(raw);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = membershipSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_MEMBERSHIP_ID", message: "Membership id must be a UUID" }, 400);
  const baseVersion = readBaseVersion(request);
  if (baseVersion === null) return apiJson({ code: "IF_MATCH_REQUIRED", message: "If-Match must contain the membership version" }, 428);

  let input: ReturnType<typeof memberInputSchema.parse>;
  try {
    input = memberInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_MEMBERSHIP", message: "Membership payload is invalid" }, 400);
  }
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("membership_update", {
    p_membership_id: parsedId.data,
    p_role: input.role,
    p_status: input.status,
    p_reason: input.reason,
    p_base_version: baseVersion,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ ...input, membershipId: parsedId.data, baseVersion })
  });
  if (error) return apiJson({ code: "MEMBERSHIP_UPDATE_FAILED", message: "Membership change was not accepted" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "MEMBERSHIP_EMPTY_RESPONSE", message: "Membership response was empty" }, 502);
  try {
    return apiJson(parseMembershipRow(row));
  } catch {
    return apiJson({ code: "MEMBERSHIP_INVALID_RESPONSE", message: "Membership projection was invalid" }, 502);
  }
}