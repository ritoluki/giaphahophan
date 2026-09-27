import { describe, expect, it } from "vitest";
import {
  balancedJournalInputSchema,
  fundSchema,
  journalInputSchema,
  journalLineInputSchema,
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

  it("keeps fund balance as a VND string", () => {
    expect(fundSchema.safeParse({ id: fundId, version: 1, name: "Quỹ minh họa", currency: "VND", balanceVnd: "150000", closedThrough: null }).success).toBe(true);
    expect(fundSchema.safeParse({ id: fundId, version: 1, name: "Quỹ minh họa", currency: "VND", balanceVnd: 150000, closedThrough: null }).success).toBe(false);
  });
});