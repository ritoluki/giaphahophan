import { describe, expect, it } from "vitest";
import { dryRunStructuredImport } from "./m16";

describe("M16 structured CSV/JSON mapping", () => {
  it("maps quoted CSV columns with versioned mapping and preserves ambiguous dates", () => {
    const mapping = {
      mappingVersion: "structured-csv/1", sourceNamespace: "synthetic-v1", dateInterpretation: "explicit_only",
      columns: { "Mã": "externalId", "Họ tên": "displayName", "Ngày sinh": "birthDate" },
    } as const;
    const result = dryRunStructuredImport('Mã,Họ tên,Ngày sinh\nP-1,"Nguyễn An, trưởng nam",khoảng 1940\nP-2,Bình,03/04/1942', mapping, "csv");
    expect(result).toMatchObject({ valid: 2, invalid: 0, mappingVersion: "structured-csv/1", parserVersion: "structured-csv/1" });
    expect(result?.rows[0]?.displayName).toBe("Nguyễn An, trưởng nam");
    expect(result?.rows[0]?.normalized?.birthDate).toMatchObject({ calendar: "unknown", precision: "about", year: 1940, originalText: "khoảng 1940" });
    expect(result?.rows[1]?.normalized?.birthDate).toMatchObject({ calendar: "unknown", precision: "unknown", originalText: "03/04/1942" });
    expect(result?.warnings).toContain("ambiguous_dates_preserved_for_review");
  });

  it("accepts dates only when source syntax is unambiguous or mapping explicitly says Gregorian DMY", () => {
    const mapping = { mappingVersion: "structured-json/1", sourceNamespace: "synthetic-v1", dateInterpretation: "gregorian_dmy", columns: { id: "externalId", name: "displayName", birth: "birthDate" } } as const;
    const result = dryRunStructuredImport([{ id: "P-1", name: "Fictional", birth: "03/04/1942" }], mapping, "json");
    expect(result?.rows[0]?.normalized?.birthDate).toMatchObject({ calendar: "gregorian", precision: "exact", year: 1942, month: 4, day: 3, originalText: "03/04/1942" });
    expect(dryRunStructuredImport([{ id: "P-1", name: "Fictional" }], { ...mapping, mappingVersion: "structured-csv/1" }, "json")).toBeNull();
    expect(dryRunStructuredImport('id,name\nP-1,"unterminated', { mappingVersion: "structured-csv/1", sourceNamespace: "synthetic-v1", dateInterpretation: "explicit_only", columns: { id: "externalId", name: "displayName" } }, "csv")).toBeNull();
  });
});
