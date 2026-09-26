import { describe, expect, it } from "vitest";
import { hasAncestryCycle, isBalancedJournal, normalizeNameSearch, publicLifeStatusAllowed } from "../src/index";

describe("genealogy domain foundation", () => {
  it("normalizes Vietnamese search without changing display values", () => {
    expect(normalizeNameSearch("  Đặng   Quỳnh  ")).toBe("dang quynh");
  });

  it("rejects self-parent and confirmed ancestry cycles", () => {
    expect(hasAncestryCycle([{ parentId: "a", childId: "a", kind: "biological", status: "confirmed" }])).toBe(true);
    expect(hasAncestryCycle([
      { parentId: "a", childId: "b", kind: "biological", status: "confirmed" },
      { parentId: "b", childId: "a", kind: "biological", status: "confirmed" }
    ])).toBe(true);
  });

  it("does not treat disputed or guardian edges as ancestry cycles", () => {
    expect(hasAncestryCycle([
      { parentId: "a", childId: "b", kind: "guardian", status: "confirmed" },
      { parentId: "b", childId: "a", kind: "biological", status: "disputed" }
    ])).toBe(false);
  });

  it("balances VND using integer strings", () => {
    expect(isBalancedJournal([{ accountId: "cash", signedAmountVnd: "1000000" }, { accountId: "income", signedAmountVnd: "-1000000" }])).toBe(true);
    expect(isBalancedJournal([{ accountId: "cash", signedAmountVnd: "0.5" }])).toBe(false);
  });

  it("defaults living and unknown people away from public projection", () => {
    expect(publicLifeStatusAllowed("living", true)).toBe(false);
    expect(publicLifeStatusAllowed("unknown", true)).toBe(false);
    expect(publicLifeStatusAllowed("deceased", false)).toBe(false);
    expect(publicLifeStatusAllowed("deceased", true)).toBe(true);
  });
});
