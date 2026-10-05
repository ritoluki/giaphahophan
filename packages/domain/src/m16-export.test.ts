import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { exportProjectionSchema, exportRequestSchema, type ExportProjection } from "@phan/contracts";
import { serializeExportCsv, serializeExportJson } from "./m16-export";

const personId = "a6600000-0000-4000-8000-000000000001";
const projection = (): ExportProjection => ({
  schemaVersion: "phan-export/1", treeId: "a6600000-0000-4000-8000-000000000002", policyVersion: 1,
  generatedAt: "2026-01-01T00:00:00Z", isDemo: true, scope: { kind: "personal", personId },
  people: [{ id: personId, version: 1, code: "DEMO-1", displayName: "Tên hư cấu, có dấu", names: [], recordedSex: null, lifeStatus: null, facts: [] }],
  parentLinks: [], unions: [], sources: [], citations: [],
});

describe("M16-06 authorized projection serialization", () => {
  it("requires explicit scope/purpose and rejects client actor, policy or unrestricted output overrides", () => {
    const input = { treeId: projection().treeId, format: "canonical_json", reason: "Synthetic personal copy", audience: "self", includeMedia: false, scope: { kind: "personal", personId } };
    expect(exportRequestSchema.parse(input)).toEqual(input);
    expect(exportRequestSchema.safeParse({ ...input, requestedBy: personId }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ ...input, includePrivate: true }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ ...input, scope: { kind: "tree", personId } }).success).toBe(false);
  });
  it.each(["=1+1", "+SUM(1,2)", "-1+1", "@HYPERLINK(x)", "\ttext", "\rtext", "\ntext", "\u0000text", "\u001ftext", "\u007ftext", "  =1+1", "\ufeff@x", "\u00a0+x"])("neutralizes dangerous CSV cell %j without altering JSON", (name) => {
    const input = projection(); input.people[0]!.displayName = name;
    const result = serializeExportCsv(input);
    const parsed = Papa.parse<Record<string, string>>(result.content, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]); expect(parsed.data[0]?.display_name).toBe("'" + name);
    expect(JSON.parse(serializeExportJson(input).content).people[0].displayName).toBe(name);
    expect(result.warnings).toContain("csv_dangerous_cells_prefixed_with_apostrophe_json_preserves_original_values");
  });
  it("quotes comma, double quote, newline and Vietnamese text without changing harmless cells", () => {
    const input = projection(); input.people[0]!.displayName = 'Tên "hư cấu",\nđời sau';
    const rows = Papa.parse<Record<string, string>>(serializeExportCsv(input).content, { header: true, skipEmptyLines: true });
    expect(rows.errors).toEqual([]); expect(rows.data[0]?.display_name).toBe(input.people[0]!.displayName);
    expect(rows.data[0]?.is_demo).toBe("demo");
  });
  it("preserves year-only and lunar leap dates in JSON and never manufactures January1", () => {
    const input = projection(); input.people[0]!.facts = [
      { id: "a6600000-0000-4000-8000-000000000003", kind: "birth", valueDate: { calendar: "gregorian", precision: "year", year: 1940, originalText: "1940" }, valueText: null, confidence: "supported" },
      { id: "a6600000-0000-4000-8000-000000000004", kind: "death", valueDate: { calendar: "vietnamese_lunar", precision: "exact", year: 2023, month: 2, day: 10, isLeapMonth: true, originalText: "10/2 nhuận 2023", timezone: "Asia/Ho_Chi_Minh" }, valueText: null, confidence: "verified" },
    ];
    expect(exportProjectionSchema.parse(JSON.parse(serializeExportJson(input).content))).toEqual(input);
    expect(input.people[0]!.facts[0]?.valueDate).not.toHaveProperty("month");
    const rows = Papa.parse<Record<string, string>>(serializeExportCsv(input).content, { header: true, skipEmptyLines: true });
    expect(JSON.parse(rows.data[0]!.death_date!)).toEqual(input.people[0]!.facts[1]!.valueDate);
  });
  it("rejects raw/private extra fields rather than serializing or silently stripping them", () => {
    const input = projection();
    expect(() => serializeExportJson({ ...input, rawPayload: { secret: "forbidden" } })).toThrow();
    expect(() => serializeExportCsv({ ...input, people: [{ ...input.people[0], phone: "forbidden" }] })).toThrow();
  });
  it("rejects hidden endpoints, references and duplicates without revealing hidden counts", () => {
    const input = projection(); input.scope = { kind: "tree" };
    input.parentLinks = [{ id: "a6600000-0000-4000-8000-000000000005", parentId: personId, childId: input.treeId, kind: "biological", status: "confirmed" }];
    expect(() => serializeExportJson(input)).toThrow(); input.parentLinks = [];
    input.citations = [{ id: "a6600000-0000-4000-8000-000000000006", sourceId: input.treeId, targetKind: "person", targetId: personId, locator: null }];
    expect(() => serializeExportJson(input)).toThrow(); input.citations = [];
    input.people.push(input.people[0]!); expect(() => serializeExportJson(input)).toThrow();
  });
  it("exports headers for an empty authorized tree instead of a fabricated person", () => {
    const input = projection(); input.scope = { kind: "tree" }; input.people = [];
    const rows = Papa.parse(serializeExportCsv(input).content, { header: true, skipEmptyLines: true });
    expect(rows.data).toEqual([]); expect(rows.meta.fields).toContain("display_name");
  });
  it("retains authorized union structure in JSON without inferring sex or parentage", () => {
    const input = projection(); input.scope = { kind: "tree" };
    input.unions = [{ id: "a6600000-0000-4000-8000-000000000007", kind: "unknown", status: "unknown", partnerIds: [personId], childIds: [] }];
    expect(JSON.parse(serializeExportJson(input).content).unions).toEqual(input.unions);
    expect(JSON.parse(serializeExportJson(input).content).parentLinks).toEqual([]);
    input.unions[0]!.childIds = [input.treeId]; expect(() => serializeExportJson(input)).toThrow();
  });
});
