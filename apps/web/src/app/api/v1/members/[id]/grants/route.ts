import { commandResultSchema, grantInputSchema, idempotencyKeySchema, membershipSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = membershipSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_MEMBERSHIP_ID", message: "Membership id must be a UUID" }, 400);
  let input: ReturnType<typeof grantInputSchema.parse>;
  try {
    input = grantInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_GRANT", message: "Grant payload is invalid" }, 400);
  }
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("membership_grant_create", {
    p_membership_id: parsedId.data,
    p_capability: input.capability,
    p_branch_id: input.branchId,
    p_expires_at: input.expiresAt,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ ...input, membershipId: parsedId.data })
  });
  if (error) return apiJson({ code: "GRANT_CREATE_FAILED", message: "Capability grant was not accepted" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "GRANT_EMPTY_RESPONSE", message: "Grant response was empty" }, 502);
  try {
    return apiJson(commandResultSchema.parse({ id: row.id, version: row.version, status: row.status }), 201);
  } catch {
    return apiJson({ code: "GRANT_INVALID_RESPONSE", message: "Grant response was invalid" }, 502);
  }
}