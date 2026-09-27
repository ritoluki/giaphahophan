import { reportSchema } from "@phan/contracts";

export function parseFundReportRpcResponse(data: unknown) {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as Record<string, unknown>;
  return reportSchema.parse({
    fundId: row.fund_id,
    from: row.from_date,
    to: row.to_date,
    openingVnd: row.opening_vnd,
    incomeVnd: row.income_vnd,
    expenseVnd: row.expense_vnd,
    closingVnd: row.closing_vnd
  });
}