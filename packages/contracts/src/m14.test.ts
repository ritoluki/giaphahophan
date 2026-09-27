import { describe, expect, it } from "vitest";
import {
  closePeriodInputSchema,
  balancedJournalInputSchema,
  fundSchema,
  journalInputSchema,
  journalLineInputSchema,
  reasonCommandSchema,
  reportRangeSchema,
  reconciliationSchema,
  reportSchema,
  reviewInputSchema,
  vndIntegerStringSchema,
} from "./index";

const fundId = "a5000000-0000-4000-8000-000000000001";
const debitAccountId = "a5000000-0000-4000-8000-000000000002";
const creditAccountId = "a5000000-0000-4000-8000-000000000003";

const journal = {
  fundId,
  entryDate: "2026-09-28",
  description: "Thu quỹ minh họa",
  lines: [
    { accountId: debitAccountId, signedAmountVnd: "150000" },
    { accountId: creditAccountId, signedAmountVnd: "-150000" },
  ],
};

describe("M14 VND and balanced ledger contracts", () => {
  it("accepts integer strings and rejects floats/unsafe bigint values", () => {
    expect(vndIntegerStringSchema.safeParse("150000").success).toBe(true);
    expect(vndIntegerStringSchema.safeParse("-150000").success).toBe(true);
    expect(vndIntegerStringSchema.safeParse("150000.5").success).toBe(false);
    expect(vndIntegerStringSchema.safeParse("9223372036854775808").success).toBe(false);
    expect(journalLineInputSchema.safeParse({ accountId: debitAccountId, signedAmountVnd: "0" }).success).toBe(false);
  });

  it("separates shape validation from posting balance validation", () => {
    expect(journalInputSchema.safeParse(journal).success).toBe(true);
    expect(balancedJournalInputSchema.safeParse(journal).success).toBe(true);
    expect(balancedJournalInputSchema.safeParse({ ...journal, lines: [{ accountId: debitAccountId, signedAmountVnd: "150000" }, { accountId: creditAccountId, signedAmountVnd: "-149999" }] }).success).toBe(false);
  });


  it("requires versioned reasons for submit and complete review input for approve", () => {
    expect(reasonCommandSchema.safeParse({ reason: "Gửi duyệt phiếu", baseVersion: 2 }).success).toBe(true);
    expect(reasonCommandSchema.safeParse({ reason: "x", baseVersion: 2 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({
      decision: "approve",
      reason: "Đã đối chiếu chứng từ",
      baseVersion: 2,
      reviewedSnapshotHash: "sha256:synthetic"
    }).success).toBe(true);
    expect(reviewInputSchema.safeParse({
      decision: "approve",
      reason: "Đã đối chiếu chứng từ",
      baseVersion: 2,
      reviewedSnapshotHash: ""
    }).success).toBe(false);
  });

  it("keeps report dates ordered and report money private/precise", () => {
    const report = {
      fundId,
      from: "2026-09-01",
      to: "2026-09-30",
      openingVnd: "1000",
      incomeVnd: "500",
      expenseVnd: "200",
      closingVnd: "1300",
    };
    expect(reportRangeSchema.safeParse({ from: report.from, to: report.to }).success).toBe(true);
    expect(reportRangeSchema.safeParse({ from: report.to, to: report.from }).success).toBe(false);
    expect(reportSchema.safeParse(report).success).toBe(true);
    expect(reportSchema.safeParse({ ...report, incomeVnd: "-1" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, donorPersonId: debitAccountId }).success).toBe(false);
  });
  it("requires coherent reconciliation proof counts and versioned close input", () => {
    const reconciliation = {
      fundId,
      from: "2026-09-01",
      to: "2026-09-30",
      status: "open",
      version: 1,
      report: {
        fundId,
        from: "2026-09-01",
        to: "2026-09-30",
        openingVnd: "1000",
        incomeVnd: "500",
        expenseVnd: "200",
        closingVnd: "1300",
      },
      postedEntries: 2,
      proof: { total: 2, ready: 1, pending: 1, missing: 0, rejected: 0 },
      lockedAt: null,
    };
    expect(reconciliationSchema.safeParse(reconciliation).success).toBe(true);
    expect(reconciliationSchema.safeParse({ ...reconciliation, proof: { ...reconciliation.proof, total: 3 } }).success).toBe(false);
    expect(closePeriodInputSchema.safeParse({ from: reconciliation.from, to: reconciliation.to, reason: "Đã đối chiếu kỳ", baseVersion: 1 }).success).toBe(true);
    expect(closePeriodInputSchema.safeParse({ from: reconciliation.to, to: reconciliation.from, reason: "Đã đối chiếu kỳ", baseVersion: 1 }).success).toBe(false);
  });
  it("keeps fund balance as a VND string", () => {
    expect(fundSchema.safeParse({ id: fundId, version: 1, name: "Quỹ minh họa", currency: "VND", balanceVnd: "150000", closedThrough: null }).success).toBe(true);
    expect(fundSchema.safeParse({ id: fundId, version: 1, name: "Quỹ minh họa", currency: "VND", balanceVnd: 150000, closedThrough: null }).success).toBe(false);
  });
});