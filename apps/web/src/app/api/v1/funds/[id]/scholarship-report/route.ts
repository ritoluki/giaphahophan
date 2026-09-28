import { reportRangeSchema, scholarshipReportSchema } from "@phan/contracts";
import { apiJson, createRequestSupabaseClient, getVerifiedUser, rpcErrorStatus } from "@/lib/server/supabase-api";
import { parseScholarshipReportRpcResponse } from "@/app/api/v1/scholarship-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = scholarshipReportSchema.shape.fundId.safeParse(id);
  if (!parsedId.success) return apiJson({ code: "INVALID_FUND_ID", message: "Fund id must be a UUID" }, 400);
  const params = new URL(request.url).searchParams;
  const range = reportRangeSchema.safeParse({ from: params.get("from"), to: params.get("to") });
  if (!range.success) return apiJson({ code: "SCHOLARSHIP_REPORT_RANGE_INVALID", message: "Report range must be ordered ISO dates" }, 422);
  const client = await createRequestSupabaseClient();
  if (!(await getVerifiedUser(client))) return apiJson({ code: "AUTH_REQUIRED", message: "A verified session is required" }, 401);
  const { data, error } = await client.schema("api").rpc("scholarship_report", {
    p_fund_id: parsedId.data,
    p_from: range.data.from,
    p_to: range.data.to,
  });
  if (error) return apiJson({ code: "SCHOLARSHIP_REPORT_FAILED", message: "Scholarship report was not available" }, rpcErrorStatus(error.code));
  try {
    const report = parseScholarshipReportRpcResponse(data);
    if (!report) return apiJson({ code: "SCHOLARSHIP_REPORT_EMPTY", message: "Scholarship report response was empty" }, 502);
    return apiJson(report);
  } catch { return apiJson({ code: "SCHOLARSHIP_REPORT_INVALID", message: "Scholarship report response was invalid" }, 502); }
}