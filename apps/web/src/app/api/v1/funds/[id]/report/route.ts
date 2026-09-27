import { reportRangeSchema, reportSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseFundReportRpcResponse } from "../../report-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = reportSchema.shape.fundId.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_FUND_ID", message: "Fund id must be a UUID" }, 400);

  const url = new URL(request.url);
  const range = reportRangeSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to")
  });
  if (!range.success) return apiJson({ code: "INVALID_REPORT_RANGE", message: "Report range must be ordered YYYY-MM-DD dates" }, 400);

  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);

  const { data, error } = await client.schema("api").rpc("fund_report", {
    p_fund_id: parsedId.data,
    p_from: range.data.from,
    p_to: range.data.to
  });
  if (error) return apiJson({ code: "FUND_REPORT_FAILED", message: "Fund report was not available" }, rpcErrorStatus(error.code));

  try {
    const report = parseFundReportRpcResponse(data);
    if (!report) return apiJson({ code: "FUND_REPORT_EMPTY", message: "Fund report response was empty" }, 502);
    return apiJson(report);
  } catch {
    return apiJson({ code: "FUND_REPORT_INVALID", message: "Fund report response was invalid" }, 502);
  }
}