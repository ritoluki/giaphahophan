import Papa from "papaparse";
import { genealogyDateSchema, importInputSchema, importMappingSchema, type ImportInput } from "@phan/contracts";
import { z } from "zod";

export type ImportClassification = "structured" | "gedcom" | "canonical";

export type ClassifiedImport = {
  input: ImportInput;
  classification: ImportClassification;
  warnings: string[];
};

const canonicalRecordSchema = z.object({
  externalId: z.string().trim().min(1).max(300),
  displayName: z.string().trim().min(1).max(300),
}).passthrough();

const canonicalDocumentSchema = z.object({
  schemaVersion: z.string().min(1).max(100),
  records: z.array(z.unknown()).max(10000),
}).strict();

export type ImportStagedRow = {
  rowNumber: number;
  externalId: string;
  displayName: string;
  status: "valid" | "invalid" | "review";
  errors: string[];
  rawPayload: Record<string, unknown> | null;
  normalized: { externalId: string; displayName: string } | null;
};

export type ImportDryRun = {
  parserVersion: string;
  mappingVersion: string;
  valid: number;
  invalid: number;
  possibleDuplicates: number;
  warnings: string[];
  rows: ImportStagedRow[];
};

export type StructuredImportMapping = z.infer<typeof importMappingSchema>;
export type StructuredImportRow = Omit<ImportStagedRow, "normalized"> & {
  normalized: {
    externalId: string;
    displayName: string;
    birthDate: z.infer<typeof genealogyDateSchema> | null;
    deathDate: z.infer<typeof genealogyDateSchema> | null;
    gender: string | null;
    notes: string | null;
  } | null;
};

function importedDate(value: string, interpretation: StructuredImportMapping["dateInterpretation"]): z.infer<typeof genealogyDateSchema> | null {
  const raw = value.trim();
  if (!raw) return null;
  const yearText = /^(\d{1,4})$/.exec(raw);
  if (yearText && Number(yearText[1]) <= 5000) return genealogyDateSchema.parse({ calendar: "unknown", precision: "year", year: Number(yearText[1]), originalText: raw });

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const dmy = interpretation === "gregorian_dmy" ? /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(raw) : null;
  const year = iso ? Number(iso[1]) : dmy ? Number(dmy[3]) : null;
  const month = iso ? Number(iso[2]) : dmy ? Number(dmy[2]) : null;
  const day = iso ? Number(iso[3]) : dmy ? Number(dmy[1]) : null;
  if (year !== null && month !== null && day !== null) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year >= 1 && year <= 5000 && month >= 1 && month <= 12 && day >= 1 && day <= (monthDays[month - 1] ?? 0)) {
      return genealogyDateSchema.parse({ calendar: "gregorian", precision: "exact", year, month, day, originalText: raw });
    }
  }

  const approximate = /^(?:about|c\.?|khoảng)\s*(\d{1,4})$/i.exec(raw);
  if (approximate && Number(approximate[1]) <= 5000) return genealogyDateSchema.parse({ calendar: "unknown", precision: "about", year: Number(approximate[1]), originalText: raw });
  const before = /^(?:before|trước)\s*(\d{1,4})$/i.exec(raw);
  if (before && Number(before[1]) <= 5000) return genealogyDateSchema.parse({ calendar: "unknown", precision: "before", year: Number(before[1]), originalText: raw });
  const after = /^(?:after|sau)\s*(\d{1,4})$/i.exec(raw);
  if (after && Number(after[1]) <= 5000) return genealogyDateSchema.parse({ calendar: "unknown", precision: "after", year: Number(after[1]), originalText: raw });
  return genealogyDateSchema.parse({ calendar: "unknown", precision: "unknown", originalText: raw });
}

/** Validate a versioned structured CSV/JSON mapping; never infer exact dates from ambiguous text. */
export function dryRunStructuredImport(value: unknown, mappingValue: unknown, format: "csv" | "json"): Omit<ImportDryRun, "rows"> & { rows: StructuredImportRow[] } | null {
  const mappingResult = importMappingSchema.safeParse(mappingValue);
  if (!mappingResult.success) return null;
  const mapping = mappingResult.data;
  if (!mapping.mappingVersion.startsWith(`structured-${format}/`)) return null;

  let records: Array<Record<string, unknown>>;
  let sourceHeaders: string[];
  if (format === "csv") {
    if (typeof value !== "string" || value.length > 10 * 1024 * 1024) return null;
    const parsed = Papa.parse<string[]>(value, { skipEmptyLines: "greedy", dynamicTyping: false, header: false });
    if (parsed.errors.length > 0 || parsed.data.length < 2 || parsed.data.length > 10_001) return null;
    sourceHeaders = (parsed.data[0] ?? []).map((header) => header.trim());
    if (sourceHeaders.some((header) => !header) || new Set(sourceHeaders).size !== sourceHeaders.length) return null;
    const mappedHeaders = Object.keys(mapping.columns);
    if (mappedHeaders.some((header) => !sourceHeaders.includes(header))) return null;
    records = parsed.data.slice(1).map((cells) => {
      if (cells.length !== sourceHeaders.length) return {};
      return Object.fromEntries(sourceHeaders.map((header, index) => [header, cells[index] ?? ""]));
    });
  } else {
    const source = Array.isArray(value) ? value : value && typeof value === "object" && !Array.isArray(value) && "records" in value ? (value as { records: unknown }).records : null;
    if (!Array.isArray(source) || source.length < 1 || source.length > 10_000 || source.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return null;
    records = source as Array<Record<string, unknown>>;
    sourceHeaders = [...new Set(records.flatMap((record) => Object.keys(record)))];
    if (Object.keys(mapping.columns).some((header) => !sourceHeaders.includes(header))) return null;
  }

  const targets = Object.values(mapping.columns);
  if (!targets.includes("externalId") || !targets.includes("displayName") || new Set(targets).size !== targets.length) return null;
  const seen = new Set<string>();
  const rows: StructuredImportRow[] = records.map((record, index) => {
    const mapped: Partial<Record<(typeof targets)[number], unknown>> = {};
    for (const [source, target] of Object.entries(mapping.columns)) mapped[target] = record[source];
    const externalId = typeof mapped.externalId === "string" ? mapped.externalId.trim() : "";
    const displayName = typeof mapped.displayName === "string" ? mapped.displayName.trim() : "";
    const errors = [
      ...(!externalId ? ["external_id_required"] : externalId.length > 300 ? ["external_id_too_long"] : []),
      ...(!displayName ? ["display_name_required"] : displayName.length > 300 ? ["display_name_too_long"] : []),
    ];
    const duplicate = externalId.length > 0 && seen.has(externalId);
    if (externalId) seen.add(externalId);
    const birthText = typeof mapped.birthDate === "string" ? mapped.birthDate : "";
    const deathText = typeof mapped.deathDate === "string" ? mapped.deathDate : "";
    const birthDate = importedDate(birthText, mapping.dateInterpretation);
    const deathDate = importedDate(deathText, mapping.dateInterpretation);
    const rawPayload = Object.fromEntries(Object.entries(record).map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 10_000) : item]));
    return {
      rowNumber: index + 1,
      externalId: externalId.slice(0, 300) || `row-${index + 1}`,
      displayName: displayName.slice(0, 300) || "Bản ghi cần kiểm tra",
      status: errors.length > 0 ? "invalid" : duplicate ? "review" : "valid",
      errors: duplicate ? [...errors, "duplicate_external_id_in_source"] : errors,
      rawPayload,
      normalized: errors.length > 0 ? null : {
        externalId, displayName, birthDate, deathDate,
        gender: typeof mapped.gender === "string" ? mapped.gender.slice(0, 100) : null,
        notes: typeof mapped.notes === "string" ? mapped.notes.slice(0, 2000) : null,
      },
    };
  });
  const valid = rows.filter((row) => row.status === "valid").length;
  const invalid = rows.filter((row) => row.status === "invalid").length;
  const possibleDuplicates = rows.filter((row) => row.status === "review").length;
  const warnings = [
    ...(sourceHeaders.filter((header) => !(header in mapping.columns)).length ? ["unmapped_source_columns_preserved_in_raw_payload"] : []),
    ...(rows.some((row) => [row.normalized?.birthDate, row.normalized?.deathDate].some((date) => date?.precision === "unknown")) ? ["ambiguous_dates_preserved_for_review"] : []),
    ...(possibleDuplicates ? ["duplicate_external_ids_require_review"] : []),
  ];
  return { parserVersion: `structured-${format}/1`, mappingVersion: mapping.mappingVersion, valid, invalid, possibleDuplicates, warnings, rows };
}

export function classifyImportInput(value: unknown): ClassifiedImport | null {
  const result = importInputSchema.safeParse(value);
  if (!result.success) return null;
  const input = result.data;
  const classification: ImportClassification = input.format === "canonical_json" ? "canonical" : input.format.startsWith("gedcom") ? "gedcom" : "structured";
  const warnings: string[] = [];
  if (input.mode === "real") warnings.push("real_data_owner_approval_required");
  if (classification === "gedcom") warnings.push("unknown_tags_preserved_for_review");
  return { input, classification, warnings };
}

/** Parse the explicitly versioned canonical JSON subset into staging-only rows. */
export function dryRunCanonicalImport(value: unknown, mappingVersion: string): ImportDryRun | null {
  const document = canonicalDocumentSchema.safeParse(value);
  if (!document.success || !mappingVersion.trim()) return null;

  const seenExternalIds = new Set<string>();
  const rows = document.data.records.map((record, index): ImportStagedRow => {
    const parsed = canonicalRecordSchema.safeParse(record);
    if (!parsed.success) {
      const rawPayload = record !== null && typeof record === "object" && !Array.isArray(record)
        ? record as Record<string, unknown>
        : null;
      return {
        rowNumber: index + 1,
        externalId: `row-${index + 1}`,
        displayName: "Bản ghi cần kiểm tra",
        status: "invalid",
        errors: parsed.error.issues.map((issue) => issue.path.join(".") || "record_invalid"),
        rawPayload,
        normalized: null,
      };
    }
    const normalized = parsed.data;
    const duplicate = seenExternalIds.has(normalized.externalId);
    seenExternalIds.add(normalized.externalId);
    return {
      rowNumber: index + 1,
      externalId: normalized.externalId,
      displayName: normalized.displayName,
      status: duplicate ? "review" : "valid",
      errors: duplicate ? ["duplicate_external_id_in_source"] : [],
      rawPayload: record as Record<string, unknown>,
      normalized: { externalId: normalized.externalId, displayName: normalized.displayName },
    };
  });
  const valid = rows.filter((row) => row.status === "valid").length;
  const invalid = rows.filter((row) => row.status === "invalid").length;
  const possibleDuplicates = rows.filter((row) => row.status === "review").length;
  const warnings = [
    ...(document.data.schemaVersion === mappingVersion ? [] : ["source_schema_version_differs_from_mapping"]),
    ...(possibleDuplicates > 0 ? ["duplicate_external_ids_require_review"] : []),
  ];
  return { parserVersion: "canonical-json/1", mappingVersion, valid, invalid, possibleDuplicates, warnings, rows };
}
