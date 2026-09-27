import { reconciliationSchema, reportSchema } from "@phan/contracts";

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
export function parseFundReconciliationRpcResponse(data: unknown) {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as Record<string, unknown>;
  return reconciliationSchema.parse({
    fundId: row.fund_id,
    from: row.from_date,
    to: row.to_date,
    status: row.status,
    version: row.version,
    report: {
      fundId: row.fund_id,
      from: row.from_date,
      to: row.to_date,
      openingVnd: row.opening_vnd,
      incomeVnd: row.income_vnd,
      expenseVnd: row.expense_vnd,
      closingVnd: row.closing_vnd,
    },
    postedEntries: row.posted_entries,
    proof: {
      total: row.proof_total,
      ready: row.proof_ready,
      pending: row.proof_pending,
      missing: row.proof_missing,
      rejected: row.proof_rejected,
    },
    lockedAt: row.locked_at,
  });
}