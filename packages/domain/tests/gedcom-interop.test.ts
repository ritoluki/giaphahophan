import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GedcomDocument } from "@domorium/validator";
import { dryRunGedcomImport } from "../src/m16-gedcom";
import { assertVendorGedcom, type VendorCase } from "./gedcom-interop-assertions";
import { serializeExportGedcom551 } from "../src/m16-export";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/gedcom-interop/${name}`, import.meta.url), "utf8");

describe("M16 versioned GEDCOM interoperability fixtures", () => {
  it.each([
    ["gramps-5.1.5.ged", "gramps"],
    ["geneweb-7.1.0-beta2.ged", "geneweb-native"],
    ["geneweb-project-roundtrip.ged", "geneweb-project"],
  ] as const)("checks measured semantics of real application output %s", (filename, kind: VendorCase) => {
    const report = assertVendorGedcom(fixture(filename), kind);
    expect(report.people).toBe(3);
    expect(report.losses).toHaveLength(kind === "geneweb-project" ? 3 : 0);
  });

  it("warns about measured external name/citation changes while retaining the exact authorized JSON sidecar", () => {
    const input = { schemaVersion: "phan-export/1", treeId: "d1600000-0000-4000-8000-000000000010", policyVersion: 1,
      generatedAt: "2026-01-01T00:00:00Z", isDemo: true, scope: { kind: "tree" }, people: [], parentLinks: [], unions: [], sources: [], citations: [] };
    const exported = serializeExportGedcom551(input);
    expect(exported.warnings).toContain("external_applications_may_change_names_and_source_citations_use_json_sidecar");
    expect(JSON.parse(exported.sidecarContent!)).toEqual(input);
  });

  it("accepts the specification-derived GEDCOM 7 fixture and preserves adopted relation, precision, citation and extension for review", () => {
    const text = fixture("spec-7-synthetic.ged");
    expect(new GedcomDocument().createDocument(text).getErrors()).toEqual([]);
    const result = dryRunGedcomImport(text);
    expect(result).not.toBeNull();
    expect(result?.version).toBe("7.0");
    expect(result?.invalid).toBe(0);
    expect(result?.records.filter(r => r.tag === "INDI")).toHaveLength(3);
    expect(result?.records.find(r => r.xref === "P1")?.normalized).toMatchObject({
      displayName: "An DEMO_PHAN", privacy: "restricted", sex: null,
      birthDate: { calendar: "gregorian", precision: "about", year: 1940 },
    });
    expect(result?.records.find(r => r.xref === "P3")?.normalized).toMatchObject({
      displayName: "Cường DEMO_PHAN", birthDate: { precision: "exact", year: 1970, month: 3, day: 12 },
      familyChildRefs: [{ xref: "F1", pedigree: "ADOPTED" }],
    });
    expect(result?.conformance.unknownTags).toContain("_DEMO_FLAG");
    expect(result?.records.find(r => r.xref === "P1")?.raw).toContain("1 _DEMO_FLAG synthetic-only");
    expect(result?.records.find(r => r.xref === "P3")?.raw).toContain("3 PAGE Trang 12");
    expect(result?.records.find(r => r.xref === "S1")?.raw).toContain("1 TITL Tư liệu hư cấu — DEMO");
    expect(result?.warnings).toContain("relationship_mapping_requires_review");
    expect(result?.rows.every(row => row.status === "review")).toBe(true);
  });
});
