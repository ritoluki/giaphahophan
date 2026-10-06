import Papa from "papaparse";
import { exportProjectionSchema, type ExportProjection } from "@phan/contracts";
import { serializeExportSvgChart } from "./m16-export-chart";

export type SerializedExport = {
  readonly content: string; readonly mimeType: string; readonly extension: "json" | "csv" | "ged" | "svg" | "pdf";
  readonly sidecarContent?: string;
  readonly sidecarMimeType?: "application/json; charset=utf-8";
  readonly sidecarExtension?: "json";
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

type GedcomVersion = "5.5.1" | "7.0";
type GedcomDate = NonNullable<ExportProjection["people"][number]["facts"][number]["valueDate"]>;
const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

function gedcomDateParts(value: GedcomDate, version: GedcomVersion): string | null {
  if (value.calendar !== "gregorian" && value.calendar !== "julian") return null;
  if (value.year === undefined || value.year < 1) return null;
  if (value.month !== undefined && (value.month < 1 || value.month > 12)) return null;
  if (value.day !== undefined && (value.day < 1 || value.day > 31)) return null;
  if (value.precision === "exact" && (value.month === undefined || value.day === undefined)) return null;
  if (value.precision === "month" && value.month === undefined) return null;
  const date = value.day !== undefined && value.month !== undefined
    ? `${String(value.day).padStart(2, "0")} ${monthNames[value.month - 1] ?? ""} ${value.year}`
    : value.month !== undefined ? `${monthNames[value.month - 1] ?? ""} ${value.year}` : String(value.year);
  if (date.includes("  ") || date.endsWith(" ")) return null;
  const qualifier = value.precision === "about" ? "ABT " : value.precision === "before" ? "BEF " : value.precision === "after" ? "AFT " : "";
  if (["unknown", "text", "month_day"].includes(value.precision)) return null;
  const julianPrefix = value.calendar === "julian" ? version === "5.5.1" ? "@#DJULIAN@ " : "JULIAN " : "";
  if (value.precision === "range" && value.rangeEnd) {
    if (value.rangeEnd.year < 1 || (value.rangeEnd.month !== undefined && (value.rangeEnd.month < 1 || value.rangeEnd.month > 12))
      || (value.rangeEnd.day !== undefined && (value.rangeEnd.day < 1 || value.rangeEnd.day > 31))) return null;
    const endMonth = value.rangeEnd.month === undefined ? "" : ` ${monthNames[value.rangeEnd.month - 1] ?? ""}`;
    const endDay = value.rangeEnd.day === undefined ? "" : `${String(value.rangeEnd.day).padStart(2, "0")} `;
    const endDate = `${endDay}${endMonth} ${value.rangeEnd.year}`.replaceAll(/\s+/g, " ").trim();
    return `${julianPrefix}BET ${date} AND ${endDate}`;
  }
  return `${julianPrefix}${qualifier}${date}`;
}

function serializeGedcom(input: unknown, version: GedcomVersion): SerializedExport {
  const projection = exportProjectionSchema.parse(input);
  const warnings = new Set<string>([
    "gedcom_subset_not_lossless_json_sidecar_attached",
    "family_partner_tags_are_layout_slots_not_sex_or_gender",
    "name_components_not_inferred",
    "canonical_identifiers_replaced_with_file_local_xrefs",
    "union_and_parent_link_semantics_are_lossless_json_sidecar_only",
  ]);
  const people = [...projection.people].sort((left, right) => left.id.localeCompare(right.id));
  const personRefs = new Map(people.map((person, index) => [person.id, `I${String(index + 1).padStart(6, "0")}`]));
  type Family = { ref: string; partners: string[]; children: string[]; unionId?: string; links: typeof projection.parentLinks };
  const families: Family[] = [];
  const coveredLinks = new Set<string>();
  for (const union of [...projection.unions].sort((left, right) => left.id.localeCompare(right.id))) {
    const partners = union.partnerIds.filter((id) => personRefs.has(id)).sort();
    const children = union.childIds.filter((id) => personRefs.has(id)).sort();
    const links = projection.parentLinks.filter((link) => partners.includes(link.parentId) && children.includes(link.childId));
    links.forEach((link) => coveredLinks.add(link.id));
    families.push({ ref: `F${String(families.length + 1).padStart(6, "0")}`, partners, children, unionId: union.id, links });
  }
  for (const link of [...projection.parentLinks].filter((item) => !coveredLinks.has(item.id)).sort((left, right) => left.id.localeCompare(right.id))) {
    families.push({ ref: `F${String(families.length + 1).padStart(6, "0")}`, partners: [link.parentId], children: [link.childId], links: [link] });
  }
  const familyByPerson = new Map<string, Array<{ ref: string; kind: string | null; status: string | null; role: "partner" | "child" }>>();
  const addFamilyRef = (personId: string, item: { ref: string; kind: string | null; status: string | null; role: "partner" | "child" }) => {
    const current = familyByPerson.get(personId) ?? [];
    current.push(item); familyByPerson.set(personId, current);
  };
  for (const family of families) {
    family.partners.forEach((personId) => addFamilyRef(personId, { ref: family.ref, kind: null, status: null, role: "partner" }));
    family.children.forEach((personId) => {
      const link = family.links.find((item) => item.childId === personId);
      addFamilyRef(personId, { ref: family.ref, kind: link?.kind ?? null, status: link?.status ?? null, role: "child" });
    });
  }

  const lines = ["0 HEAD", "1 SOUR PHAN_GIA_PHA", "2 VERS 0.1", "1 GEDC", `2 VERS ${version}`];
  if (version === "5.5.1") lines.push("2 FORM LINEAGE-LINKED", "1 CHAR UTF-8");
  lines.push("1 SUBM @U000001@");
  lines.push(`1 DATE ${String(Number(projection.generatedAt.slice(8, 10))).padStart(2, "0")} ${monthNames[Number(projection.generatedAt.slice(5, 7)) - 1] ?? "JAN"} ${projection.generatedAt.slice(0, 4)}`);
  const maxLineLength = version === "5.5.1" ? 255 : Number.POSITIVE_INFINITY;
  const cleanPayload = (payload: string) => payload.replace(/\r\n|\r/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, () => { warnings.add("gedcom_control_characters_replaced_json_sidecar_preserves_original"); return "�"; });
  const appendText = (level: number, tag: string, rawPayload: string) => {
    const payload = cleanPayload(rawPayload);
    const textLines = payload.split("\n");
    for (let index = 0; index < textLines.length; index += 1) {
      let remainder = textLines[index] ?? "";
      let currentLevel = level;
      let currentTag = index === 0 ? tag : "CONT";
      do {
        const escaped = version === "5.5.1" ? remainder.replaceAll("@", "@@") : remainder.startsWith("@") ? `@${remainder}` : remainder;
        const prefix = `${currentLevel} ${currentTag}`;
        const separator = escaped.length ? " " : "";
        let capacity = Math.max(1, maxLineLength - Array.from(prefix + separator).length);
        const points = Array.from(escaped);
        if (version === "5.5.1" && points[capacity - 1] === "@" && points[capacity] === "@") capacity -= 1;
        const part = points.slice(0, capacity).join("");
        lines.push(prefix + (part ? ` ${part}` : ""));
        remainder = points.slice(capacity).join("");
        currentLevel = level + 1;
        currentTag = version === "5.5.1" ? "CONC" : "CONT";
      } while (remainder.length > 0);
    }
  };
  const appendDate = (level: number, tag: "DATE", value: GedcomDate) => {
    const formatted = gedcomDateParts(value, version);
    if (formatted) lines.push(`${level} ${tag} ${formatted}`);
    else {
      if (value.calendar === "vietnamese_lunar") {
        warnings.add("vietnamese_lunar_dates_kept_in_json_sidecar");
      } else {
        warnings.add("nonrepresentable_date_kept_in_json_sidecar");
      }
      appendText(level, "NOTE", `Original date text is preserved in the attached JSON sidecar: ${value.originalText}`);
    }
  };
  const sourceRefs = new Map([...projection.sources].sort((left, right) => left.id.localeCompare(right.id)).map((source, index) => [source.id, `S${String(index + 1).padStart(6, "0")}`]));
  const citationsByTarget = (kind: "person" | "fact" | "parent_link" | "union", id: string) => projection.citations.filter((citation) => citation.targetKind === kind && citation.targetId === id);
  const appendCitations = (level: number, kind: "person" | "fact" | "parent_link" | "union", id: string) => {
    for (const citation of citationsByTarget(kind, id)) {
      const sourceRef = sourceRefs.get(citation.sourceId);
      if (!sourceRef) continue;
      lines.push(`${level} SOUR @${sourceRef}@`);
      if (citation.locator) appendText(level + 1, "PAGE", citation.locator);
    }
  };

  people.forEach((person) => {
    const ref = personRefs.get(person.id)!;
    lines.push(`0 @${ref}@ INDI`);
    appendText(1, "NAME", person.displayName);
    for (const name of person.names) { appendText(1, "NAME", name.name); appendText(2, "TYPE", name.kind); }
    if (person.recordedSex) appendText(1, "SEX", person.recordedSex);
    for (const fact of person.facts) {
      const event = fact.kind === "birth" ? "BIRT" : fact.kind === "death" ? "DEAT" : fact.kind === "burial" ? "BURI" : null;
      if (event) {
        lines.push(`1 ${event}`);
        const eventLineCount = lines.length;
        if (fact.valueDate) appendDate(2, "DATE", fact.valueDate);
        if (fact.valueText) appendText(2, "NOTE", fact.valueText);
        if (lines.length === eventLineCount) {
          warnings.add("event_without_details_is_described_in_json_sidecar");
          appendText(2, "NOTE", "Event details are preserved in the attached JSON sidecar.");
        }
      } else if (fact.kind === "occupation") {
        if (fact.valueText) appendText(1, "OCCU", fact.valueText);
        else warnings.add("occupation_without_value_kept_in_json_sidecar");
      } else if (fact.valueText || fact.valueDate) {
        warnings.add("other_fact_kind_kept_in_json_sidecar");
      }
      appendCitations(event ? 2 : 1, "fact", fact.id);
    }
    for (const familyRef of familyByPerson.get(person.id) ?? []) {
      if (familyRef.role === "partner") lines.push(`1 FAMS @${familyRef.ref}@`);
      else {
        lines.push(`1 FAMC @${familyRef.ref}@`);
        if (familyRef.kind === "biological") appendText(2, "PEDI", version === "7.0" ? "BIRTH" : "birth");
        else if (familyRef.kind === "adoptive") appendText(2, "PEDI", version === "7.0" ? "ADOPTED" : "adopted");
        else if (familyRef.kind) warnings.add("nonstandard_parent_link_kind_kept_in_json_sidecar");
        if (familyRef.status && familyRef.status !== "confirmed") warnings.add("nonconfirmed_parent_link_status_kept_in_json_sidecar");
      }
    }
    appendCitations(1, "person", person.id);
  });
  families.forEach((family) => {
    lines.push(`0 @${family.ref}@ FAM`);
    if (family.partners[0]) lines.push(`1 HUSB @${personRefs.get(family.partners[0])}@`);
    if (family.partners[1]) lines.push(`1 WIFE @${personRefs.get(family.partners[1])}@`);
    if (family.partners.length > 2) warnings.add("more_than_two_partners_kept_in_json_sidecar");
    for (const child of family.children) lines.push(`1 CHIL @${personRefs.get(child)}@`);
    const union = family.unionId ? projection.unions.find((item) => item.id === family.unionId) : undefined;
    if (union) {
      if (union.kind !== "marriage" || union.status !== "active") warnings.add("nonstandard_union_semantics_kept_in_json_sidecar");
      appendCitations(1, "union", union.id);
    }
    for (const link of family.links) {
      if (link.kind !== "biological" || link.status !== "confirmed") warnings.add("nonstandard_parent_link_semantics_kept_in_json_sidecar");
      appendCitations(1, "parent_link", link.id);
    }
  });
  for (const source of [...projection.sources].sort((left, right) => left.id.localeCompare(right.id))) {
    lines.push(`0 @${sourceRefs.get(source.id)}@ SOUR`);
    appendText(1, "TITL", source.title);
  }
  lines.push("0 @U000001@ SUBM", "1 NAME Phan Gia Pha");
  lines.push("0 TRLR");
  if (projection.parentLinks.length) warnings.add("relationship_edge_sidecar_is_lossless_source_of_truth");
  return {
    content: lines.join("\n") + "\n", mimeType: "text/plain; charset=utf-8", extension: "ged",
    sidecarContent: serializeExportJson(projection).content,
    sidecarMimeType: "application/json; charset=utf-8", sidecarExtension: "json",
    warnings: [...warnings],
  };
}

export function serializeExportGedcom551(input: unknown): SerializedExport { return serializeGedcom(input, "5.5.1"); }
export function serializeExportGedcom7(input: unknown): SerializedExport { return serializeGedcom(input, "7.0"); }

export function serializeExportSvg(input: unknown): SerializedExport {
  const result = serializeExportSvgChart(input);
  return { ...result, mimeType: "image/svg+xml; charset=utf-8", extension: "svg" };
}
