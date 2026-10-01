import { genealogyDateSchema } from "@phan/contracts";

export type GedcomVersion = "5.5.1" | "7.0";
export type GedcomRecord = { xref: string; tag: string; raw: string[]; normalized: Record<string, unknown> };
export type GedcomDryRun = {
  parserVersion: "gedcom-subset/1";
  mappingVersion: "gedcom-subset/1";
  version: GedcomVersion;
  valid: number;
  invalid: number;
  possibleDuplicates: number;
  warnings: string[];
  conformance: { supported: string[]; unsupported: string[]; unknownTags: string[] };
  records: GedcomRecord[];
  rows: Array<{ rowNumber: number; externalId: string; displayName: string; status: "valid" | "invalid" | "review"; errors: string[]; rawPayload: Record<string, unknown>; normalized: Record<string, unknown> | null }>;
};

type Line = { level: number; xref: string | null; tag: string; value: string; raw: string; children: Line[] };
const MAX_BYTES = 10 * 1024 * 1024;
const months: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const knownTags = new Set(["HEAD", "TRLR", "GEDC", "VERS", "CHAR", "SOUR", "DEST", "DATE", "SUBM", "INDI", "FAM", "NAME", "GIVN", "SURN", "NICK", "NPFX", "SPFX", "NSFX", "SEX", "BIRT", "DEAT", "BURI", "EVEN", "TYPE", "PLAC", "FAMC", "FAMS", "PEDI", "STAT", "HUSB", "WIFE", "CHIL", "MARR", "DIV", "SOUR", "NOTE", "CONT", "CONC", "OBJE", "FILE", "TITL", "FORM", "RESN", "CHAN", "DATA", "TEXT", "PAGE", "QUAY", "_PHAN_LUNAR_DATE", "_PHAN_PRIVACY"]);
const normalizedTags = new Set(["HEAD", "TRLR", "GEDC", "VERS", "CHAR", "INDI", "FAM", "NAME", "GIVN", "SURN", "NICK", "NPFX", "SPFX", "NSFX", "SEX", "BIRT", "DEAT", "DATE", "TYPE", "PLAC", "FAMC", "FAMS", "PEDI", "STAT", "HUSB", "WIFE", "CHIL", "MARR", "_PHAN_LUNAR_DATE", "_PHAN_PRIVACY"]);
const MAX_REPORTED_TAGS = 200;

function parsedate(text: string): Record<string, unknown> {
  const raw = text.trim();
  const calendar = /^(?:@#DJULIAN@|JULIAN\b)/i.test(raw) ? "julian" : "gregorian";
  const value = raw.replace(/^@#D(?:GREGORIAN|JULIAN|HEBREW|FRENCH_R)@\s*/i, "").replace(/^(?:JULIAN|GREGORIAN|HEBREW|FRENCH_R)\s+/i, "");
  const qualifier = /^(ABT|CAL|EST|BEF|AFT)\s+(.+)$/i.exec(value);
  const base = qualifier?.[2] ?? value;
  const year = /(?:^|\s)(\d{1,4})\s*$/.exec(base);
  let result: Record<string, unknown>;
  if (!year) result = { calendar: "unknown", precision: "unknown", originalText: raw };
  else {
    const yearNumber = Number(year[1]);
    const monthDay = /^(\d{1,2})\s+([A-Z]{3})\s+\d{1,4}$/i.exec(base);
    const monthYear = /^([A-Z]{3})\s+\d{1,4}$/i.exec(base);
    const month = monthDay ? months[monthDay[2]!.toUpperCase()] : monthYear ? months[monthYear[1]!.toUpperCase()] : undefined;
    if (monthDay && month) {
      const day = Number(monthDay[1]);
      const leap = calendar === "julian" ? yearNumber % 4 === 0 : yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0);
      const monthLength = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
      if (day >= 1 && day <= monthLength) result = { calendar, precision: "exact", year: yearNumber, month, day, originalText: raw };
      else result = { calendar: "unknown", precision: "unknown", originalText: raw };
    }
    else if (monthYear && month) result = { calendar, precision: "month", year: yearNumber, month, originalText: raw };
    else if (/^\d{1,4}$/.test(base)) result = { calendar, precision: "year", year: yearNumber, originalText: raw };
    else result = { calendar: "unknown", precision: "unknown", originalText: raw };
  }
  if (qualifier?.[1]?.toUpperCase() === "ABT" || qualifier?.[1]?.toUpperCase() === "CAL" || qualifier?.[1]?.toUpperCase() === "EST") result.precision = "about";
  if (qualifier?.[1]?.toUpperCase() === "BEF") result.precision = "before";
  if (qualifier?.[1]?.toUpperCase() === "AFT") result.precision = "after";
  return genealogyDateSchema.parse(result);
}

function firstValue(lines: Line[], tag: string): string | null { return lines.find((line) => line.tag === tag)?.value ?? null; }
function nestedValue(lines: Line[], parent: string, child: string): string | null {
  for (const line of lines.filter((item) => item.tag === parent)) {
    const result = firstValue(line.children, child);
    if (result !== null) return result;
  }
  return null;
}

/** Parse a deliberately bounded GEDCOM line subset. Unknown structures remain byte-for-text raw and are never interpreted. */
export function dryRunGedcomImport(input: string): GedcomDryRun | null {
  if (!input || new TextEncoder().encode(input).byteLength > MAX_BYTES || input.includes("\0")) return null;
  const sourceLines = input.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  if (sourceLines.length > 200_000 || sourceLines.some((line) => line.length > 32_768)) return null;
  const roots: Line[] = [];
  const stack: Line[] = [];
  for (const raw of sourceLines) {
    if (!raw) continue;
    const match = /^(\d{1,2}) (?:@([^@\s]+)@ )?([A-Za-z0-9_]+)(?: (.*))?$/.exec(raw);
    if (!match) return null;
    const level = Number(match[1]);
    while (stack.length && (stack.at(-1)?.level ?? -1) >= level) stack.pop();
    if (level > 99 || (level > 0 && (stack.length === 0 || level > (stack.at(-1)?.level ?? -1) + 1))) return null;
    const node: Line = { level, xref: match[2] ?? null, tag: match[3]!.toUpperCase(), value: match[4] ?? "", raw, children: [] };
    if (level === 0) roots.push(node);
    else stack.at(-1)?.children.push(node);
    stack.push(node);
  }
  const head = roots[0];
  const trailer = roots.at(-1);
  if (head?.tag !== "HEAD" || trailer?.tag !== "TRLR") return null;
  const gedc = head.children.find((line) => line.tag === "GEDC");
  const version = firstValue(gedc?.children ?? [], "VERS");
  const source = firstValue(head.children, "SOUR") ?? "";
  const is7 = version?.startsWith("7") === true || /FamilySearch/i.test(source);
  if (!version || (!version.startsWith("5.5.1") && !version.startsWith("7"))) return null;
  const supportedVersion: GedcomVersion = is7 ? "7.0" : "5.5.1";
  const xrefSet = new Set<string>();
  const records: GedcomRecord[] = [];
  const unknownTags = new Set<string>();
  const unsupported = new Set<string>();
  const supported = new Set<string>();
  const recordRoots = roots.filter((line) => line.tag !== "HEAD" && line.tag !== "TRLR");
  if (recordRoots.length > 10_000) return null;
  for (const root of roots) {
    const visit = (line: Line): void => {
      if (normalizedTags.has(line.tag)) supported.add(line.tag);
      else if (knownTags.has(line.tag)) unsupported.add(line.tag);
      else unknownTags.add(line.tag);
      for (const child of line.children) visit(child);
    };
    visit(root);
  }
  for (const root of recordRoots) {
    if (!root.xref || xrefSet.has(root.xref)) return null;
    xrefSet.add(root.xref);
    const descendants: Line[] = [];
    const visit = (line: Line): void => { descendants.push(line); for (const child of line.children) visit(child); };
    visit(root);
    for (const line of descendants) {
      if (!normalizedTags.has(line.tag) && knownTags.has(line.tag)) unsupported.add(line.tag);
    }
    const raw = descendants.map((line) => line.raw);
    const normalized: Record<string, unknown> = { externalId: root.xref, recordType: root.tag };
    if (root.tag === "INDI") {
      const names = root.children.filter((line) => line.tag === "NAME").map((line) => ({ raw: line.value, given: firstValue(line.children, "GIVN"), surname: firstValue(line.children, "SURN"), type: firstValue(line.children, "TYPE") }));
      const primaryName = names[0]?.raw?.replaceAll("/", " ").replace(/\s+/g, " ").trim() ?? "";
      normalized.displayName = primaryName;
      normalized.names = names;
      normalized.sex = firstValue(root.children, "SEX");
      normalized.birthDate = nestedValue(root.children, "BIRT", "DATE") ? parsedate(nestedValue(root.children, "BIRT", "DATE")!) : null;
      normalized.birthPlace = nestedValue(root.children, "BIRT", "PLAC");
      normalized.deathDate = nestedValue(root.children, "DEAT", "DATE") ? parsedate(nestedValue(root.children, "DEAT", "DATE")!) : null;
      normalized.deathPlace = nestedValue(root.children, "DEAT", "PLAC");
      normalized.familyChildRefs = root.children.filter((line) => line.tag === "FAMC").map((line) => ({ xref: line.value.replace(/^@|@$/g, ""), pedigree: firstValue(line.children, "PEDI"), status: firstValue(line.children, "STAT") }));
      normalized.familySpouseRefs = root.children.filter((line) => line.tag === "FAMS").map((line) => line.value.replace(/^@|@$/g, ""));
      normalized.appSidecar = root.children.filter((line) => line.tag === "_PHAN_LUNAR_DATE" || line.tag === "_PHAN_PRIVACY").map((line) => ({ tag: line.tag, rawValue: line.value }));
      normalized.privacy = "restricted";
    } else if (root.tag === "FAM") {
      normalized.partnerRefs = root.children.filter((line) => line.tag === "HUSB" || line.tag === "WIFE").map((line) => ({ sourceTag: line.tag, xref: line.value.replace(/^@|@$/g, "") }));
      normalized.childRefs = root.children.filter((line) => line.tag === "CHIL").map((line) => line.value.replace(/^@|@$/g, ""));
      normalized.marriageDate = nestedValue(root.children, "MARR", "DATE") ? parsedate(nestedValue(root.children, "MARR", "DATE")!) : null;
    } else {
      normalized.preservedRecord = true;
    }
    records.push({ xref: root.xref, tag: root.tag, raw, normalized });
  }
  const idSet = new Set(records.map((record) => record.xref));
  const brokenRefs = new Map<string, string[]>();
  for (const record of records) for (const line of record.raw) {
    const match = /^\d+ (?:FAMC|FAMS|HUSB|WIFE|CHIL) @([^@]+)@/.exec(line);
    if (match && !idSet.has(match[1]!)) brokenRefs.set(record.xref, [...(brokenRefs.get(record.xref) ?? []), "unresolved_relationship_reference"]);
  }
  const conformance = {
    supported: [...supported].sort().slice(0, MAX_REPORTED_TAGS),
    unsupported: [...unsupported].sort().slice(0, MAX_REPORTED_TAGS),
    unknownTags: [...unknownTags].sort().slice(0, MAX_REPORTED_TAGS),
  };
  const reportTruncated = supported.size > MAX_REPORTED_TAGS || unsupported.size > MAX_REPORTED_TAGS || unknownTags.size > MAX_REPORTED_TAGS;
  const warnings = [
    ...(unknownTags.size ? ["unknown_tags_preserved_for_review"] : []),
    ...(unsupported.size ? ["known_but_unmapped_structures_preserved_for_review"] : []),
    ...(reportTruncated ? ["gedcom_conformance_tag_list_truncated_to_200"] : []),
    ...(brokenRefs.size ? ["unresolved_relationship_references_require_review"] : []),
    ...(records.some((record) => record.raw.some((line) => /\s_PHAN_LUNAR_DATE(?:\s|$)/.test(line))) ? [] : ["lunar_calendar_sidecar_not_present"]),
    "privacy_defaults_to_restricted; no GEDCOM note or media path is published",
  ];
  const rows = records.map((record, index) => ({
    rowNumber: index + 1, externalId: record.xref,
    displayName: typeof record.normalized.displayName === "string" && record.normalized.displayName ? record.normalized.displayName : `(Bản ghi ${record.xref})`,
    status: record.tag !== "INDI" && record.tag !== "FAM" || record.tag === "INDI" && !record.normalized.displayName || brokenRefs.has(record.xref) ? "review" as const : "valid" as const,
    errors: [...(record.tag === "INDI" && !record.normalized.displayName ? ["name_missing_review_required"] : []), ...(record.tag !== "INDI" && record.tag !== "FAM" ? ["record_type_preserved_for_review"] : []), ...(brokenRefs.get(record.xref) ?? [])],
    rawPayload: { gedcom: record.raw }, normalized: record.normalized,
  }));
  return {
    parserVersion: "gedcom-subset/1", mappingVersion: "gedcom-subset/1", version: supportedVersion,
    valid: rows.filter((row) => row.status === "valid").length, invalid: 0,
    possibleDuplicates: rows.filter((row) => row.status === "review").length,
    warnings: [...new Set(warnings)],
    conformance, records, rows,
  };
}
