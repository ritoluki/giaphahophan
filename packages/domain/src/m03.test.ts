import { describe, expect, it } from "vitest";

import { isSameCanonicalPerson, normalizeYearOnlyDate, protectsUnknownLifeStatus, validateCanonicalIdentity } from "./index";

describe("M03-01 canonical identity", () => {
  it("accepts stable UUID/code with repeated alias names", () => {
    expect(validateCanonicalIdentity({
      id: "30000000-0000-4000-8000-000000000001",
      code: "M03-PERSON-001",
      displayName: "Synthetic Nguyễn Trung",
      names: [
        { name: "Synthetic Nguyễn Trung", kind: "preferred" },
        { name: "Nguyễn Trung", kind: "alias" },
        { name: "Nguyễn Trung", kind: "alias" }
      ]
    })).toEqual([]);
  });

  it("rejects empty identity fields but does not reject duplicate names", () => {
    expect(validateCanonicalIdentity({
      id: "not-an-id",
      code: " ",
      displayName: "",
      names: [{ name: " ", kind: "alias" }]
    })).toEqual(["id_must_be_uuid", "code_required", "display_name_required", "name_required"]);
  });

  it("compares canonical people only by stable UUID", () => {
    expect(isSameCanonicalPerson("30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isSameCanonicalPerson("30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002")).toBe(false);
  });

  it("round-trips year-only dates without inventing month/day", () => {
    const normalized = normalizeYearOnlyDate({
      calendar: "gregorian",
      precision: "year",
      year: 1901,
      month: 1,
      day: 1,
      isLeapMonth: false,
      originalText: "Năm 1901"
    });
    expect(normalized).toEqual({
      calendar: "gregorian",
      precision: "year",
      year: 1901,
      originalText: "Năm 1901"
    });
  });

  it("protects unknown life status like living", () => {
    expect(protectsUnknownLifeStatus("unknown")).toBe(true);
    expect(protectsUnknownLifeStatus("living")).toBe(true);
    expect(protectsUnknownLifeStatus("deceased")).toBe(false);
  });
});
