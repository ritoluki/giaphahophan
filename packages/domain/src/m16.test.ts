import { describe, expect, it } from "vitest";
import { classifyImportInput, dryRunCanonicalImport } from "./m16";

describe("M16 import domain", () => {
  it("classifies formats and warns before real-data intake", () => {
    const result = classifyImportInput({ treeId: "a6100000-0000-4000-8000-000000000001", assetId: "a6100000-0000-4000-8000-000000000002", format: "gedcom_551", sourceNamespace: "legacy-demo", mappingVersion: "v1", mode: "real" });
    expect(result).toMatchObject({ classification: "gedcom", warnings: ["real_data_owner_approval_required", "unknown_tags_preserved_for_review"] });
  });

  it("stages canonical JSON rows without turning unknown dates into exact dates", () => {
    const result = dryRunCanonicalImport({ schemaVersion: "v1", records: [
      { externalId: "demo-1", displayName: "Nguyễn An (hư cấu)", birthDate: "khoảng năm 1940" },
      { externalId: "demo-1", displayName: "Nguyễn Bình (hư cấu)" },
      { displayName: "Thiếu mã ngoài" },
    ] }, "v1");
    expect(result).toMatchObject({ valid: 1, invalid: 1, possibleDuplicates: 1 });
    expect(result?.rows[0]?.rawPayload?.birthDate).toBe("khoảng năm 1940");
    expect(result?.rows[1]?.status).toBe("review");
    expect(result?.rows[2]?.status).toBe("invalid");
  });

  it("rejects a malformed canonical envelope instead of manufacturing a successful preview", () => {
    expect(dryRunCanonicalImport({ records: [{ externalId: "x", displayName: "Tên" }] }, "v1")).toBeNull();
  });
});
