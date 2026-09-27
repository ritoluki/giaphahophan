import { describe, expect, it } from "vitest";
import { buildFundReconciliation, buildFundReport, inspectJournalBalance, parseJournalInput, sumJournalVnd, validateJournalForPosting } from "./m14";

const journal = {
  fundId: "a5100000-0000-4000-8000-000000000001",
  entryDate: "2026-09-28",
  description: "Phiếu minh họa",
  lines: [
    { accountId: "a5100000-0000-4000-8000-000000000002", signedAmountVnd: "9007199254740993" },
    { accountId: "a5100000-0000-4000-8000-000000000003", signedAmountVnd: "-9007199254740993" },
  ],
};

describe("M14 balanced ledger domain", () => {
  it("sums VND with bigint semantics and never floating point", () => {
    expect(sumJournalVnd(journal.lines)).toBe("0");
    expect(inspectJournalBalance(journal.lines)).toMatchObject({ totalVnd: "0", balanced: true, lineCount: 2 });
  });

  it("separates draft shape parsing from balanced posting validation", () => {
    const unbalanced = { ...journal, lines: [{ ...journal.lines[0], signedAmountVnd: "10" }, { ...journal.lines[1], signedAmountVnd: "-9" }] };
    expect(parseJournalInput(unbalanced)).not.toBeNull();
    expect(validateJournalForPosting(unbalanced)).toBeNull();
    expect(validateJournalForPosting(journal)).not.toBeNull();
  });


  it("builds opening, receipt, payment and closing balances from posted asset lines", () => {
    const report = buildFundReport({
      fundId: "a5100000-0000-4000-8000-000000000001",
      from: "2026-09-01",
      to: "2026-09-30",
      lines: [
        { entryDate: "2026-08-31", status: "posted", accountKind: "asset", signedAmountVnd: "1000" },
        { entryDate: "2026-09-10", status: "posted", accountKind: "asset", signedAmountVnd: "500" },
        { entryDate: "2026-09-10", status: "posted", accountKind: "income", signedAmountVnd: "-500" },
        { entryDate: "2026-09-15", status: "posted", accountKind: "asset", signedAmountVnd: "-200" },
        { entryDate: "2026-09-15", status: "posted", accountKind: "expense", signedAmountVnd: "200" },
        { entryDate: "2026-10-01", status: "posted", accountKind: "asset", signedAmountVnd: "700" },
        { entryDate: "2026-09-20", status: "draft", accountKind: "asset", signedAmountVnd: "999" },
      ],
    });
    expect(report).toMatchObject({
      openingVnd: "1000",
      incomeVnd: "500",
      expenseVnd: "200",
      closingVnd: "1300",
    });
  });

  it("fails closed on reversed ranges and malformed report money", () => {
    expect(buildFundReport({
      fundId: "a5100000-0000-4000-8000-000000000001",
      from: "2026-10-01",
      to: "2026-09-01",
      lines: [],
    })).toBeNull();
    expect(buildFundReport({
      fundId: "a5100000-0000-4000-8000-000000000001",
      from: "2026-09-01",
      to: "2026-09-30",
      lines: [{ entryDate: "2026-09-01", status: "posted", accountKind: "asset", signedAmountVnd: "not-money" }],
    })).toBeNull();
  });
  it("builds reconciliation proof status once per posted journal", () => {
    const reconciliation = buildFundReconciliation({
      fundId: "a5100000-0000-4000-8000-000000000001",
      from: "2026-09-01",
      to: "2026-09-30",
      status: "locked",
      version: 2,
      lockedAt: "2026-09-28T00:00:00.000Z",
      lines: [
        { journalId: "a5100000-0000-4000-8000-000000000010", entryDate: "2026-09-10", status: "posted", accountKind: "asset", signedAmountVnd: "500", proofStatus: "ready" },
        { journalId: "a5100000-0000-4000-8000-000000000010", entryDate: "2026-09-10", status: "posted", accountKind: "income", signedAmountVnd: "-500", proofStatus: "ready" },
        { journalId: "a5100000-0000-4000-8000-000000000011", entryDate: "2026-09-15", status: "posted", accountKind: "asset", signedAmountVnd: "-200", proofStatus: "pending" },
        { journalId: "a5100000-0000-4000-8000-000000000011", entryDate: "2026-09-15", status: "posted", accountKind: "expense", signedAmountVnd: "200", proofStatus: "pending" },
      ],
    });
    expect(reconciliation).toMatchObject({
      status: "locked",
      postedEntries: 2,
      proof: { total: 2, ready: 1, pending: 1, missing: 0, rejected: 0 },
      report: { incomeVnd: "500", expenseVnd: "200", closingVnd: "300" },
    });
    expect(buildFundReconciliation({
      fundId: "a5100000-0000-4000-8000-000000000001",
      from: "2026-09-01",
      to: "2026-09-30",
      status: "open",
      version: 1,
      lockedAt: null,
      lines: [{ journalId: "not-a-uuid", entryDate: "2026-09-01", status: "posted", accountKind: "asset", signedAmountVnd: "1", proofStatus: "missing" }],
    })).toBeNull();
  });
  it("fails closed on malformed money values", () => {
    expect(sumJournalVnd([{ signedAmountVnd: "not-money" }])).toBeNull();
    expect(inspectJournalBalance([{ signedAmountVnd: "not-money" }]).balanced).toBe(false);
  });
});