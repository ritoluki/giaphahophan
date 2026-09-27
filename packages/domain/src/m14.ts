import {
  balancedJournalInputSchema,
  journalInputSchema,
  journalStatusSchema,
  reportRangeSchema,
  proofStatusSchema,
  reconciliationSchema,
  reportSchema,
  type JournalInput,
  type JournalLineInput,
  type ReconciliationRecord,
  type ReportRecord,
} from "@phan/contracts";

export type JournalBalance = {
  readonly totalVnd: string;
  readonly lineCount: number;
  readonly balanced: boolean;
};

export function sumJournalVnd(lines: readonly Pick<JournalLineInput, "signedAmountVnd">[]): string | null {
  try {
    return lines.reduce((total, line) => total + BigInt(line.signedAmountVnd), 0n).toString();
  } catch {
    return null;
  }
}

export function inspectJournalBalance(lines: readonly Pick<JournalLineInput, "signedAmountVnd">[]): JournalBalance {
  const totalVnd = sumJournalVnd(lines);
  return {
    totalVnd: totalVnd ?? "invalid",
    lineCount: lines.length,
    balanced: totalVnd === "0" && lines.length >= 2,
  };
}

export function parseJournalInput(input: unknown): JournalInput | null {
  const result = journalInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function validateJournalForPosting(input: unknown): JournalInput | null {
  const result = balancedJournalInputSchema.safeParse(input);
  return result.success ? result.data : null;
}
export type FundReportLine = {
  entryDate: string;
  status: "draft" | "submitted" | "posted" | "rejected";
  accountKind: "asset" | "income" | "expense" | "equity";
  signedAmountVnd: string;
};

export function buildFundReport(input: {
  fundId: string;
  from: string;
  to: string;
  lines: readonly FundReportLine[];
}): ReportRecord | null {
  const range = reportRangeSchema.safeParse({ from: input.from, to: input.to });
  if (!range.success) return null;

  let opening = 0n;
  let income = 0n;
  let expense = 0n;
  let closing = 0n;

  for (const line of input.lines) {
    if (!journalStatusSchema.safeParse(line.status).success || line.status !== "posted" || line.accountKind !== "asset") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(line.entryDate)) return null;
    let amount: bigint;
    try {
      amount = BigInt(line.signedAmountVnd);
    } catch {
      return null;
    }

    if (line.entryDate < range.data.from) opening += amount;
    if (line.entryDate <= range.data.to) {
      closing += amount;
      if (line.entryDate >= range.data.from) {
        if (amount >= 0n) income += amount;
        else expense -= amount;
      }
    }
  }

  try {
    return reportSchema.parse({
      fundId: input.fundId,
      from: range.data.from,
      to: range.data.to,
      openingVnd: opening.toString(),
      incomeVnd: income.toString(),
      expenseVnd: expense.toString(),
      closingVnd: closing.toString(),
    });
  } catch {
    return null;
  }
}
export type FundReconciliationLine = FundReportLine & {
  journalId: string;
  proofStatus: "missing" | "pending" | "ready" | "rejected";
};

export function buildFundReconciliation(input: {
  fundId: string;
  from: string;
  to: string;
  status: "open" | "locked";
  version: number;
  lockedAt: string | null;
  lines: readonly FundReconciliationLine[];
}): ReconciliationRecord | null {
  const range = reportRangeSchema.safeParse({ from: input.from, to: input.to });
  if (!range.success) return null;
  const report = buildFundReport({
    fundId: input.fundId,
    from: range.data.from,
    to: range.data.to,
    lines: input.lines,
  });
  if (!report) return null;

  const entries = new Map<string, FundReconciliationLine["proofStatus"]>();
  for (const line of input.lines) {
    if (line.status !== "posted" || line.entryDate < range.data.from || line.entryDate > range.data.to) continue;
    if (!/^[0-9a-f-]{36}$/i.test(line.journalId) || !proofStatusSchema.safeParse(line.proofStatus).success) return null;
    const existing = entries.get(line.journalId);
    if (existing && existing !== line.proofStatus) return null;
    entries.set(line.journalId, line.proofStatus);
  }

  const proof = {
    total: entries.size,
    ready: [...entries.values()].filter((value) => value === "ready").length,
    pending: [...entries.values()].filter((value) => value === "pending").length,
    missing: [...entries.values()].filter((value) => value === "missing").length,
    rejected: [...entries.values()].filter((value) => value === "rejected").length,
  };
  try {
    return reconciliationSchema.parse({
      fundId: input.fundId,
      from: range.data.from,
      to: range.data.to,
      status: input.status,
      version: input.version,
      report,
      postedEntries: entries.size,
      proof,
      lockedAt: input.lockedAt,
    });
  } catch {
    return null;
  }
}