import { describe, expect, it } from "vitest";
import { hasAncestryCycle, isBalancedJournal, normalizeNameSearch, publicLifeStatusAllowed, searchPeople } from "../src/index";

describe("genealogy domain foundation", () => {
  it("normalizes Vietnamese search without changing display values", () => {
    expect(normalizeNameSearch("  Đặng   Quỳnh  ")).toBe("dang quynh");
  });

  it("matches accented and unaccented aliases without changing canonical display", () => {
    const results = searchPeople([{
      id: "30000000-0000-4000-8000-000000000001",
      version: 1,
      code: "DEMO-P001",
      displayName: "Phan Đức An",
      lifeStatus: "deceased",
      primaryBranchId: null,
      isDemo: true,
      names: [{ name: "Phan Đỗ", kind: "alias" }]
    }], "phan do");

    expect(results).toHaveLength(1);
    expect(results[0]?.displayName).toBe("Phan Đức An");
    expect(results[0]?.matchedNames).toEqual([{ name: "Phan Đỗ", kind: "alias" }]);
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
