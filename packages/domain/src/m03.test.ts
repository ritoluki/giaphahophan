import { describe, expect, it } from "vitest";

import { isSameCanonicalPerson, validateCanonicalIdentity } from "./index";

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
});
