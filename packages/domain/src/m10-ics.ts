import type { PlannedOccurrence } from "./m10";

export type IcsExportScope = "self" | "members" | "public_feed";
export type IcsExportOptions = { scope: IcsExportScope; authorized: boolean; generatedAt: string };
export type IcsExportResult =
  | { status: "exported"; calendar: string; occurrenceCount: number }
  | { status: "denied"; reason: "not_authorized" | "public_feed_not_supported" }
  | { status: "invalid"; reason: "invalid_generated_at" | "invalid_occurrence_date" };

function daysInGregorianMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  if (year < 1900 || year > 2099 || month < 1 || month > 12) return null;
  return day >= 1 && day <= daysInGregorianMonth(year, month) ? { year, month, day } : null;
}
function addOneDay(value: { year: number; month: number; day: number }) {
  const monthLength = daysInGregorianMonth(value.year, value.month);
  if (value.day < monthLength) return { ...value, day: value.day + 1 };
  if (value.month < 12) return { year: value.year, month: value.month + 1, day: 1 };
  return { year: value.year + 1, month: 1, day: 1 };
}
function compactDate(value: { year: number; month: number; day: number }): string {
  return [String(value.year).padStart(4, "0"), String(value.month).padStart(2, "0"), String(value.day).padStart(2, "0")].join("");
}
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([;,])/g, "\\$1").replace(/\r?\n/g, "\\n");
}
function stableUid(occurrence: PlannedOccurrence): string {
  return `occurrence-${encodeURIComponent(occurrence.ruleId)}-${encodeURIComponent(occurrence.logicalKey)}@giaphapha.local`;
}
function sequenceFor(occurrence: PlannedOccurrence): number {
  return Math.max(0, occurrence.ruleVersion - 1) + occurrence.overrideVersion;
}
function eventLines(occurrence: PlannedOccurrence, generatedAt: string): string[] | null {
  const start = parseIsoDate(occurrence.occursOn);
  if (!start) return null;
  return [
    "BEGIN:VEVENT",
    `UID:${stableUid(occurrence)}`,
    `DTSTAMP:${generatedAt}`,
    `SEQUENCE:${sequenceFor(occurrence)}`,
    `DTSTART;VALUE=DATE:${compactDate(start)}`,
    `DTEND;VALUE=DATE:${compactDate(addOneDay(start))}`,
    `SUMMARY:${escapeText(occurrence.title)}`,
    `STATUS:${occurrence.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}
export function exportOccurrencesToIcs(occurrences: ReadonlyArray<PlannedOccurrence>, options: IcsExportOptions): IcsExportResult {
  if (!options.authorized) return { status: "denied", reason: "not_authorized" };
  if (options.scope === "public_feed") return { status: "denied", reason: "public_feed_not_supported" };
  if (!/^\d{8}T\d{6}Z$/.test(options.generatedAt)) return { status: "invalid", reason: "invalid_generated_at" };
  const events: string[] = []; const seenUids = new Set<string>();
  for (const occurrence of occurrences) {
    const uid = stableUid(occurrence);
    if (seenUids.has(uid)) continue;
    const lines = eventLines(occurrence, options.generatedAt);
    if (!lines) return { status: "invalid", reason: "invalid_occurrence_date" };
    seenUids.add(uid); events.push(lines.join("\r\n"));
  }
  const calendar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Phan Gia Pha//Calendar//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR", ""].join("\r\n");
  return { status: "exported", calendar, occurrenceCount: events.length };
}
