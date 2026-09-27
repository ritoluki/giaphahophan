import { describe, expect, it } from "vitest";
import { inspectJournalBalance, parseJournalInput, sumJournalVnd, validateJournalForPosting } from "./m14";

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

  it("fails closed on malformed money values", () => {
    expect(sumJournalVnd([{ signedAmountVnd: "not-money" }])).toBeNull();
    expect(inspectJournalBalance([{ signedAmountVnd: "not-money" }]).balanced).toBe(false);
  });
});