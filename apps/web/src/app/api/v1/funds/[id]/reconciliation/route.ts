import { reconciliationSchema, reportRangeSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseFundReconciliationRpcResponse } from "../../report-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = reconciliationSchema.shape.fundId.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_FUND_ID", message: "Fund id must be a UUID" }, 400);

  const url = new URL(request.url);
  const range = reportRangeSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!range.success) return apiJson({ code: "INVALID_RECONCILIATION_RANGE", message: "Reconciliation range must be ordered YYYY-MM-DD dates" }, 400);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("fund_period_reconciliation", {
    p_fund_id: parsedId.data,
    p_from: range.data.from,
    p_to: range.data.to,
  });
  if (error) return apiJson({ code: "FUND_RECONCILIATION_FAILED", message: "Fund reconciliation was not available" }, rpcErrorStatus(error.code));

  try {
    const reconciliation = parseFundReconciliationRpcResponse(data);
    if (!reconciliation) return apiJson({ code: "FUND_RECONCILIATION_EMPTY", message: "Fund reconciliation response was empty" }, 502);
    return apiJson(reconciliation);
  } catch {
    return apiJson({ code: "FUND_RECONCILIATION_INVALID", message: "Fund reconciliation response was invalid" }, 502);
  }
}