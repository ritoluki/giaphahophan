import { importInputSchema, type ImportInput } from "@phan/contracts";
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
