import { closePeriodInputSchema, idempotencyKeySchema, reconciliationSchema } from "@phan/contracts";
import { apiJson, createRequestHash, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseFundReconciliationRpcResponse } from "../../report-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = reconciliationSchema.shape.fundId.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_FUND_ID", message: "Fund id must be a UUID" }, 400);

  let input: ReturnType<typeof closePeriodInputSchema.parse>;
  try {
    input = closePeriodInputSchema.parse(await request.json());
  } catch {
    return apiJson({ code: "INVALID_PERIOD_CLOSE", message: "Period close payload is invalid" }, 400);
  }

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return apiJson({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must be a UUID" }, 428);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("fund_period_close", {
    p_fund_id: parsedId.data,
    p_from: input.from,
    p_to: input.to,
    p_reason: input.reason,
    p_base_version: input.baseVersion,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: createRequestHash({ fundId: parsedId.data, ...input }),
  });
  if (error) return apiJson({ code: "FUND_PERIOD_CLOSE_FAILED", message: "Fund period was not closed" }, rpcErrorStatus(error.code));

  try {
    const reconciliation = parseFundReconciliationRpcResponse(data);
    if (!reconciliation) return apiJson({ code: "FUND_RECONCILIATION_EMPTY", message: "Fund period close response was empty" }, 502);
    return apiJson(reconciliation, 201);
  } catch {
    return apiJson({ code: "FUND_RECONCILIATION_INVALID", message: "Fund period close response was invalid" }, 502);
  }
}