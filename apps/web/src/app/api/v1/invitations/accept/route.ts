import { createHash } from "node:crypto";
import { idempotencyKeySchema, invitationAcceptInputSchema, invitationMutationResultSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  let input: ReturnType<typeof invitationAcceptInputSchema.parse>;
  try {
    input = invitationAcceptInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_INVITATION_TOKEN", message: "Invitation token is invalid" }, 400);
  }
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("invitation_accept_idempotent", {
    p_token_hash: hashToken(input.token),
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ tokenHash: hashToken(input.token) })
  });
  if (error) return apiJson({ code: "INVITATION_ACCEPT_FAILED", message: "Invitation is unavailable" }, rpcErrorStatus(error.code));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "INVITATION_EMPTY_RESPONSE", message: "Invitation response was empty" }, 502);
  try {
    return apiJson(invitationMutationResultSchema.parse({ id: row.id, treeId: row.tree_id, status: row.status, version: row.version }));
  } catch {
    return apiJson({ code: "INVITATION_INVALID_RESPONSE", message: "Invitation projection was invalid" }, 502);
  }
}
