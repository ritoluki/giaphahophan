import type { ParentLinkInput, GenealogyDate, JournalLine } from "@phan/contracts";

export type CanonicalIdentityInput = {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
  readonly names: ReadonlyArray<{ readonly name: string; readonly kind: "birth" | "preferred" | "alias" | "religious" | "other" }>;
};

export function validateCanonicalIdentity(input: CanonicalIdentityInput): string[] {
  const errors: string[] = [];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) errors.push("id_must_be_uuid");
  if (input.code.trim().length === 0) errors.push("code_required");
  if (input.displayName.trim().length === 0) errors.push("display_name_required");
  if (input.names.some((name) => name.name.trim().length === 0)) errors.push("name_required");
  return errors;
}

export function isSameCanonicalPerson(leftId: string, rightId: string): boolean {
  return leftId === rightId;
}

export function normalizeYearOnlyDate(value: GenealogyDate): GenealogyDate {
  if (value.precision !== "year") return value;
  const { month: _month, day: _day, isLeapMonth: _isLeapMonth, ...yearOnly } = value;
  return yearOnly;
}

export function protectsUnknownLifeStatus(status: "living" | "deceased" | "unknown"): boolean {
  return status !== "deceased";
}

export function normalizeNameSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi-VN")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateGenealogyDate(value: GenealogyDate): string[] {
  const errors: string[] = [];
  if (value.precision === "year" && (value.month !== undefined || value.day !== undefined)) errors.push("year_precision_has_subparts");
  if (value.precision === "month_day" && (value.month === undefined || value.day === undefined || value.year !== undefined)) errors.push("month_day_requires_no_year");
  if (value.month !== undefined && (value.month < 1 || value.month > (value.calendar === "vietnamese_lunar" ? 13 : 12))) errors.push("month_out_of_range");
  if (value.day !== undefined && (value.day < 1 || value.day > 31)) errors.push("day_out_of_range");
  if (value.calendar !== "vietnamese_lunar" && value.isLeapMonth) errors.push("leap_month_wrong_calendar");
  return errors;
}

export function hasAncestryCycle(edges: ReadonlyArray<Pick<ParentLinkInput, "parentId" | "childId" | "kind" | "status">>): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.parentId === edge.childId) return true;
    if (edge.status !== "confirmed" || (edge.kind !== "biological" && edge.kind !== "adoptive")) continue;
    const children = adjacency.get(edge.parentId) ?? [];
    children.push(edge.childId);
    adjacency.set(edge.parentId, children);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of adjacency.get(node) ?? []) if (visit(child)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...adjacency.keys()].some(visit);
}

export function isBalancedJournal(lines: ReadonlyArray<JournalLine>): boolean {
  try {
    return lines.length > 0 && lines.reduce((sum, line) => sum + BigInt(line.signedAmountVnd), 0n) === 0n;
  } catch {
    return false;
  }
}

export function publicLifeStatusAllowed(status: "living" | "deceased" | "unknown", explicitPublication: boolean): boolean {
  return explicitPublication && status === "deceased";
}
export * from "./m04";
export * from "./m05";
export * from "./m06";

export * from "./m10";

export * from "./m10-rsvp";

export * from "./m10-ics";

export * from "./m12";

export * from "./m12-publish";

export * from "./m12-seo";

export * from './m13';
