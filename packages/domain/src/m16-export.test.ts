import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { GedcomDocument } from "@domorium/validator";
import { exportProjectionSchema, exportRequestSchema, type ExportProjection } from "@phan/contracts";
import { serializeExportCsv, serializeExportGedcom551, serializeExportGedcom7, serializeExportJson, serializeExportSvg } from "./m16-export";
import { buildExportChartPages } from "./m16-export-chart";
import { dryRunGedcomImport } from "./m16-gedcom";

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
  it.each([
    ["5.5.1", serializeExportGedcom551], ["7.0", serializeExportGedcom7],
  ] as const)("serializes GEDCOM %s from the filtered projection and attaches a lossless JSON sidecar", (version, serialize) => {
    const input = projection(); input.scope = { kind: "tree" };
    input.people[0]!.facts.push({ id: "a6600000-0000-4000-8000-000000000016", kind: "birth", valueDate: { calendar: "gregorian", precision: "year", year: 1940, originalText: "1940" }, valueText: null, confidence: "supported" });
    const partnerId = "a6600000-0000-4000-8000-000000000008";
    const childId = "a6600000-0000-4000-8000-000000000009";
    input.people.push(
      { id: partnerId, version: 1, code: "DEMO-2", displayName: "Người hư cấu thứ hai", names: [], recordedSex: null, lifeStatus: null, facts: [] },
      { id: childId, version: 1, code: "DEMO-3", displayName: "Người hư cấu thứ ba", names: [], recordedSex: null, lifeStatus: null, facts: [
        { id: "a6600000-0000-4000-8000-000000000010", kind: "birth", valueDate: { calendar: "julian", precision: "exact", year: 1900, month: 2, day: 29, originalText: "@#DJULIAN@ 29 FEB 1900" }, valueText: null, confidence: "supported" },
        { id: "a6600000-0000-4000-8000-000000000011", kind: "death", valueDate: { calendar: "vietnamese_lunar", precision: "exact", year: 2023, month: 2, day: 10, isLeapMonth: true, originalText: "10/2 nhuận 2023", timezone: "Asia/Ho_Chi_Minh" }, valueText: null, confidence: "unverified" },
      ] },
    );
    input.unions = [{ id: "a6600000-0000-4000-8000-000000000012", kind: "partnership", status: "active", partnerIds: [partnerId, personId], childIds: [childId] }];
    input.parentLinks = [{ id: "a6600000-0000-4000-8000-000000000013", parentId: personId, childId, kind: "biological", status: "confirmed" }];
    input.sources = [{ id: "a6600000-0000-4000-8000-000000000014", title: "Tư liệu tổng hợp hư cấu" }];
    input.citations = [{ id: "a6600000-0000-4000-8000-000000000015", sourceId: input.sources[0]!.id, targetKind: "fact", targetId: input.people[2]!.facts[0]!.id, locator: "Trang 12" }];
    const result = serialize(input);
    const externalDiagnostics = new GedcomDocument().createDocument(result.content).getErrors();
    expect(externalDiagnostics).toEqual([]);
    expect(result.extension).toBe("ged");
    expect(result.sidecarExtension).toBe("json");
    expect(result.sidecarMimeType).toBe("application/json; charset=utf-8");
    expect(JSON.parse(result.sidecarContent ?? "null")).toEqual(input);
    expect(result.content).toContain(`2 VERS ${version}`);
    expect(result.content).toContain("2 DATE 1940");
    expect(result.content).not.toContain("01 JAN 1940");
    expect(result.content).toContain(version === "7.0" ? "2 DATE JULIAN 29 FEB 1900" : "2 DATE @#DJULIAN@ 29 FEB 1900");
    expect(result.content).not.toContain("_PHAN_");
    expect(result.content).toContain("1 HUSB @I");
    expect(result.content).toContain("1 WIFE @I");
    expect(result.warnings).toContain("family_partner_tags_are_layout_slots_not_sex_or_gender");
    expect(result.warnings).toContain("relationship_edge_sidecar_is_lossless_source_of_truth");
    expect(result.warnings).toContain("vietnamese_lunar_dates_kept_in_json_sidecar");
    expect(result.warnings).toContain("union_and_parent_link_semantics_are_lossless_json_sidecar_only");
    expect(result.content).not.toContain(input.treeId);
    const parsed = dryRunGedcomImport(result.content);
    expect(parsed?.version).toBe(version);
    expect(parsed?.records.filter((record) => record.tag === "INDI")).toHaveLength(3);
  });
  it("wraps GEDCOM 5.5.1 without exceeding its line limit and uses CONT (not CONC) for GEDCOM 7", () => {
    const input = projection(); input.people[0]!.displayName = `${"Tên".repeat(120)}\nDòng hai @ký hiệu`;
    const ged551 = serializeExportGedcom551(input);
    expect(Math.max(...ged551.content.split("\n").map((line) => line.length))).toBeLessThanOrEqual(255);
    expect(ged551.content).toContain("CONC");
    const ged7 = serializeExportGedcom7(input);
    expect(ged7.content).toContain("CONT");
    expect(ged7.content).not.toMatch(/^\d+ CONC(?: |$)/m);
    expect(ged7.content).toContain("@ký hiệu");
  });
  it.each([
    ["5.5.1", serializeExportGedcom551], ["7.0", serializeExportGedcom7],
  ] as const)("passes the independent @domorium validator structural checks for GEDCOM %s synthetic export", (version, serialize) => {
    const input = projection(); input.scope = { kind: "tree" };
    input.people[0]!.facts.push({
      id: "a6600000-0000-4000-8000-000000000035", kind: "birth",
      valueDate: { calendar: "gregorian", precision: "range", year: 1890, month: 1, day: 1, rangeEnd: { year: 1891, month: 2, day: 2 }, originalText: "BET 01 JAN 1890 AND 02 FEB 1891" },
      valueText: null, confidence: "supported",
    });
    const exported = serialize(input);
    const diagnostics = new GedcomDocument().createDocument(exported.content).getErrors();
    expect(diagnostics.filter((diagnostic) => diagnostic.level === "error")).toEqual([]);
    expect(exported.sidecarExtension).toBe("json");
  });
  it("does not emit forbidden control bytes and preserves the exact authorized value only in the JSON sidecar", () => {
    const input = projection(); input.people[0]!.displayName = "Tên\u0001hư cấu";
    const result = serializeExportGedcom7(input);
    expect(result.content).not.toContain("\u0001");
    expect(JSON.parse(result.sidecarContent ?? "null").people[0].displayName).toBe("Tên\u0001hư cấu");
    expect(result.warnings).toContain("gedcom_control_characters_replaced_json_sidecar_preserves_original");
  });
  it("renders escaped, paginated SVG sheets with explicit relationship kinds and preserves all projected people", () => {
    const input = projection(); input.scope = { kind: "tree" };
    input.people[0]!.displayName = `<script>alert("x")</script> & Tên`;
    for (let index = 2; index <= 33; index += 1) input.people.push({
      id: `a6600000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      version: 1, code: `DEMO-${index}`, displayName: `Người tổng hợp ${index}`, names: [], recordedSex: null,
      lifeStatus: null, facts: [],
    });
    input.parentLinks = [{ id: "a6600000-0000-4000-8000-000000000034", parentId: input.people[0]!.id, childId: input.people[1]!.id, kind: "adoptive", status: "disputed" }];
    const pages = buildExportChartPages(input);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const svg = serializeExportSvg(input);
    expect(svg.extension).toBe("svg");
    expect(svg.mimeType).toContain("image/svg+xml");
    expect(svg.content).toContain("&lt;script&gt;");
    expect(svg.content).not.toContain("<script>");
    expect(svg.content).toContain("adoptive · disputed");
    for (const person of input.people) expect(svg.content).toContain(person.code);
    expect(svg.warnings).toContain("svg_is_paginated_two_sheets_per_row");
  });
  it("replaces XML-forbidden controls in SVG and reports the loss explicitly", () => {
    const input = projection(); input.people[0]!.displayName = "Tên\u0001 tổng hợp";
    const result = serializeExportSvg(input);
    expect(result.content).not.toContain("\u0001");
    expect(result.content).toContain("\uFFFD");
    expect(result.warnings).toContain("svg_invalid_xml_controls_replaced_with_unicode_replacement_character");
  });
});
