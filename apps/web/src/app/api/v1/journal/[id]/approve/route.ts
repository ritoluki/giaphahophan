import { idempotencyKeySchema, journalSchema, reviewInputSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseJournalRpcResponse } from "../../journal-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = journalSchema.shape.id.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_JOURNAL_ID", message: "Journal id must be a UUID" }, 400);

  let input: ReturnType<typeof reviewInputSchema.parse>;
  try {
    input = reviewInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_JOURNAL_APPROVE", message: "Journal approval payload is invalid" }, 400);
  }
  if (input.decision !== "approve") {
    return apiJson({ code: "INVALID_JOURNAL_DECISION", message: "Journal approval endpoint only accepts approve" }, 422);
  }

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("journal_entry_approve_idempotent", {
    p_entry_id: parsedId.data,
    p_base_version: input.baseVersion,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ entryId: parsedId.data, ...input })
  });
  if (error) return apiJson({ code: "JOURNAL_APPROVE_FAILED", message: "Journal approval was not accepted" }, rpcErrorStatus(error.code));

  try {
    const journal = parseJournalRpcResponse(data);
    if (!journal) return apiJson({ code: "JOURNAL_EMPTY_RESPONSE", message: "Journal approval response was empty" }, 502);
    return apiJson(journal);
  } catch {
    return apiJson({ code: "JOURNAL_INVALID_RESPONSE", message: "Journal approval response was invalid" }, 502);
  }
}