import { createHash, randomBytes } from "node:crypto";
import { idempotencyKeySchema, invitationInputSchema, invitationMutationResultSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request) {
  let input: ReturnType<typeof invitationInputSchema.parse>;
  try {
    input = invitationInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_INVITATION", message: "Invitation payload is invalid" }, 400);
  }

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const rawToken = randomBytes(32).toString("base64url");
  const { data, error } = await client.schema("api").rpc("invitation_create_idempotent", {
    p_tree_id: input.treeId,
    p_email_hash: hashValue(input.email.trim().toLowerCase()),
    p_email_ciphertext: null,
    p_intended_role: input.role,
    p_branch_id: input.branchId ?? null,
    p_token_hash: hashValue(rawToken),
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash(input)
  });
  if (error) return apiJson({ code: "INVITATION_CREATE_FAILED", message: "Invitation was not accepted" }, rpcErrorStatus(error.code));

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiJson({ code: "INVITATION_EMPTY_RESPONSE", message: "Invitation response was empty" }, 502);
  try {
    return apiJson(invitationMutationResultSchema.parse({ id: row.id, treeId: row.tree_id, status: row.status, version: row.version }), 201);
  } catch {
    return apiJson({ code: "INVITATION_INVALID_RESPONSE", message: "Invitation projection was invalid" }, 502);
  }
}
