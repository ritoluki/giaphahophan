import Papa from "papaparse";
import { exportProjectionSchema, type ExportProjection } from "@phan/contracts";

export type SerializedExport = {
  readonly content: string; readonly mimeType: string; readonly extension: "json" | "csv";
  readonly warnings: readonly string[];
};

export function serializeExportJson(input: unknown): SerializedExport {
  const projection = exportProjectionSchema.parse(input);
  return { content: JSON.stringify(projection, null, 2) + "\n", mimeType: "application/json; charset=utf-8", extension: "json", warnings: [] };
}

const csvColumns = ["is_demo", "schema_version", "generated_at", "code", "display_name", "recorded_sex", "life_status", "birth_date", "death_date"];
// Also catches leading Unicode whitespace/BOM before formula markers and every
// leading C0/DEL control byte. Papa handles RFC4180 quotes/newlines, never eval.
const spreadsheetDanger = /^(?:[\u0000-\u001f\u007f]|\s*[=+\-@])/u;

function dateCell(person: ExportProjection["people"][number], kind: "birth" | "death"): string {
  const dates = person.facts.filter((fact) => fact.kind === kind && fact.valueDate !== null).map((fact) => fact.valueDate);
  // Multiple conflicting facts must not be collapsed into a fabricated date.
  return dates.map((date) => JSON.stringify(date)).join(" | ");
}

export function serializeExportCsv(input: unknown): SerializedExport {
  const projection = exportProjectionSchema.parse(input);
  const data = projection.people.map((person) => [
    projection.isDemo ? "demo" : "real", projection.schemaVersion, projection.generatedAt,
    person.code, person.displayName, person.recordedSex ?? "", person.lifeStatus ?? "",
    dateCell(person, "birth"), dateCell(person, "death"),
  ]);
  const content = "\ufeff" + Papa.unparse({ fields: csvColumns, data }, {
    delimiter: ",", newline: "\r\n", header: true, quotes: true, escapeFormulae: spreadsheetDanger,
  }) + "\r\n";
  return {
    content, mimeType: "text/csv; charset=utf-8", extension: "csv",
    warnings: ["csv_flat_people_only_use_json_for_authorized_relationships_and_citations", "csv_dangerous_cells_prefixed_with_apostrophe_json_preserves_original_values"],
  };
}
