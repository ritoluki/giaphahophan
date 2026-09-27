import type { EventRule, GenealogyDate, Occurrence } from "@phan/contracts";
import {
  LunarCalendarError,
  vnLunarAdapter,
  type LunarDate,
  type SolarDate,
} from "@phan/lunar";

export type LunarLeapPolicy =
  | "regular_only"
  | "leap_only_skip"
  | "prefer_leap_else_regular"
  | "both_if_exists";

export type ShortMonthPolicy =
  | "last_day"
  | "next_month_first"
  | "skip"
  | "manual_override";

export type RecurrencePlanBlockReason =
  | "source_date_incomplete"
  | "source_date_not_lunar"
  | "source_leap_needs_review"
  | "target_year_out_of_range"
  | "manual_override_required"
  | "unsupported_recurrence";

export type RecurrenceCandidate = {
  logicalKey: string;
  requestedLunarDate: LunarDate;
  resolvedLunarDate: LunarDate;
  solarDate: SolarDate;
  adjustment: "none" | "last_day" | "next_month_first";
  algorithmVersion: string;
  canAutoNotify: boolean;
};

export type LunarRecurrencePlan =
  | {
      status: "ready";
      candidates: ReadonlyArray<RecurrenceCandidate>;
      algorithmVersion: string;
      canAutoNotify: boolean;
    }
  | {
      status: "skipped";
      candidates: ReadonlyArray<RecurrenceCandidate>;
      algorithmVersion: string;
      canAutoNotify: false;
      reason: "no_matching_leap_month" | "short_month_skipped";
    }
  | {
      status: "blocked";
      candidates: ReadonlyArray<RecurrenceCandidate>;
      algorithmVersion: string;
      canAutoNotify: false;
      reason: RecurrencePlanBlockReason;
    };

export type LunarRecurrenceInput = Pick<
  EventRule,
  "sourceDate" | "recurrence" | "leapPolicy" | "shortMonthPolicy" | "reviewStatus"
> & {
  targetLunarYear: number;
};

function isLunarDateComplete(
  sourceDate: GenealogyDate,
): sourceDate is GenealogyDate & {
  calendar: "vietnamese_lunar";
  month: number;
  day: number;
} {
  return (
    sourceDate.calendar === "vietnamese_lunar" &&
    (sourceDate.precision === "exact" || sourceDate.precision === "month_day") &&
    sourceDate.month !== undefined &&
    sourceDate.day !== undefined
  );
}

function blocked(
  reason: RecurrencePlanBlockReason,
): LunarRecurrencePlan {
  return {
    status: "blocked",
    candidates: [],
    algorithmVersion: vnLunarAdapter.algorithmVersion,
    canAutoNotify: false,
    reason,
  };
}

function skipped(
  reason: "no_matching_leap_month" | "short_month_skipped",
): LunarRecurrencePlan {
  return {
    status: "skipped",
    candidates: [],
    algorithmVersion: vnLunarAdapter.algorithmVersion,
    canAutoNotify: false,
    reason,
  };
}

function daysInGregorianMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

function addSolarDays(value: SolarDate, days: number): SolarDate {
  let result = { ...value };
  for (let index = 0; index < days; index += 1) {
    const monthLength = daysInGregorianMonth(result.year, result.month);
    if (result.day < monthLength) {
      result = { ...result, day: result.day + 1 };
    } else if (result.month < 12) {
      result = { year: result.year, month: result.month + 1, day: 1 };
    } else {
      result = { year: result.year + 1, month: 1, day: 1 };
    }
  }
  return result;
}

function selectLeapInstances(
  year: number,
  month: number,
  policy: LunarLeapPolicy,
): ReadonlyArray<boolean> | "skip" {
  const leapMonth = vnLunarAdapter.getLeapMonth(year);
  const hasMatchingLeap = leapMonth === month;
  switch (policy) {
    case "regular_only":
      return [false];
    case "leap_only_skip":
      return hasMatchingLeap ? [true] : "skip";
    case "prefer_leap_else_regular":
      return [hasMatchingLeap];
    case "both_if_exists":
      return hasMatchingLeap ? [false, true] : [false];
  }
}

function makeCandidate(
  year: number,
  month: number,
  day: number,
  isLeapMonth: boolean,
  shortMonthPolicy: ShortMonthPolicy,
): RecurrenceCandidate | "skip" | "manual_override" {
  const monthLength = vnLunarAdapter.getMonthLength(year, month, isLeapMonth);
  const requestedLunarDate: LunarDate = { year, month, day, isLeapMonth };
  let resolvedLunarDate = requestedLunarDate;
  let adjustment: RecurrenceCandidate["adjustment"] = "none";

  if (day > monthLength) {
    if (shortMonthPolicy === "skip") return "skip";
    if (shortMonthPolicy === "manual_override") return "manual_override";
    if (shortMonthPolicy === "last_day") {
      resolvedLunarDate = { ...requestedLunarDate, day: monthLength };
      adjustment = "last_day";
    } else {
      const firstDaySolar = vnLunarAdapter.lunarToSolar({
        year,
        month,
        day: 1,
        isLeapMonth,
      });
      const nextMonthFirstSolar = addSolarDays(firstDaySolar, monthLength);
      resolvedLunarDate = vnLunarAdapter.solarToLunar(nextMonthFirstSolar);
      adjustment = "next_month_first";
    }
  }

  const solarDate = vnLunarAdapter.lunarToSolar(resolvedLunarDate);
  return {
    logicalKey: `lunar:${year}:${month}:${isLeapMonth ? "leap" : "regular"}:${day}`,
    requestedLunarDate,
    resolvedLunarDate,
    solarDate,
    adjustment,
    algorithmVersion: vnLunarAdapter.algorithmVersion,
    canAutoNotify: true,
  };
}

export function planAnnualLunarRecurrence(
  input: LunarRecurrenceInput,
): LunarRecurrencePlan {
  if (input.recurrence !== "annual_lunar") {
    return blocked("unsupported_recurrence");
  }
  if (!isLunarDateComplete(input.sourceDate)) {
    return blocked(
      input.sourceDate.calendar === "vietnamese_lunar"
        ? "source_date_incomplete"
        : "source_date_not_lunar",
    );
  }
  if (input.sourceDate.isLeapMonth === true && input.reviewStatus !== "approved") {
    return blocked("source_leap_needs_review");
  }

  try {
    const targetYear = input.targetLunarYear;
    const month = input.sourceDate.month;
    const day = input.sourceDate.day;
    if (!Number.isInteger(targetYear)) return blocked("target_year_out_of_range");
    const selected = selectLeapInstances(
      targetYear,
      month,
      input.leapPolicy ?? "regular_only",
    );
    if (selected === "skip") return skipped("no_matching_leap_month");

    const candidates: RecurrenceCandidate[] = [];
    for (const isLeapMonth of selected) {
      const candidate = makeCandidate(
        targetYear,
        month,
        day,
        isLeapMonth,
        input.shortMonthPolicy ?? "last_day",
      );
      if (candidate === "manual_override") return blocked("manual_override_required");
      if (candidate === "skip") continue;
      candidates.push({ ...candidate, canAutoNotify: input.reviewStatus === "approved" });
    }

    if (candidates.length === 0) return skipped("short_month_skipped");
    return {
      status: "ready",
      candidates,
      algorithmVersion: vnLunarAdapter.algorithmVersion,
      canAutoNotify: input.reviewStatus === "approved",
    };
  } catch (error) {
    if (
      error instanceof LunarCalendarError &&
      error.code === "UNSUPPORTED_CALENDAR_YEAR"
    ) {
      return blocked("target_year_out_of_range");
    }
    throw error;
  }
}

export type PlannedOccurrence = Occurrence & {
  logicalKey: string;
  canAutoNotify: boolean;
  policyVersion: string;
  ruleVersion: number;
  overrideReason: string | null;
  overrideVersion: number;
};

export type OccurrenceQueryResult = {
  occurrences: ReadonlyArray<PlannedOccurrence>;
  blockedReasons: ReadonlyArray<RecurrencePlanBlockReason | "invalid_query_range">;
  algorithmVersion: string;
  policyVersion: string;
};

function parseCivilDate(value: string): SolarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2099 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInGregorianMonth(year, month)) return null;
  return { year, month, day };
}

function compareSolarDate(left: SolarDate, right: SolarDate): number {
  return (
    left.year - right.year ||
    left.month - right.month ||
    left.day - right.day
  );
}

function solarDateToString(value: SolarDate): string {
  return [
    String(value.year).padStart(4, "0"),
    String(value.month).padStart(2, "0"),
    String(value.day).padStart(2, "0"),
  ].join("-");
}

function lunarLabel(value: LunarDate): string {
  return [
    String(value.day).padStart(2, "0"),
    String(value.month).padStart(2, "0"),
    value.isLeapMonth ? "nhuận" : "thường",
    String(value.year),
  ].join("/");
}

function createLunarOccurrence(
  rule: EventRule,
  candidate: RecurrenceCandidate,
  policyVersion: string,
): PlannedOccurrence {
  const occursOn = solarDateToString(candidate.solarDate);
  return {
    id: `event:${rule.id}:${candidate.logicalKey}`,
    ruleId: rule.id,
    title: rule.title,
    occursOn,
    startsAt: null,
    endsAt: null,
    solarLabel: occursOn,
    lunarLabel: lunarLabel(candidate.resolvedLunarDate),
    status: "scheduled",
    algorithmVersion: candidate.algorithmVersion,
    isDemo: false,
    logicalKey: candidate.logicalKey,
    canAutoNotify: candidate.canAutoNotify,
    policyVersion,
    ruleVersion: rule.version,
    overrideReason: null,
    overrideVersion: 0,
  };
}

function createSolarOccurrence(
  rule: EventRule,
  solarDate: SolarDate,
  policyVersion: string,
): PlannedOccurrence {
  const occursOn = solarDateToString(solarDate);
  const logicalKey = `solar:${occursOn}`;
  return {
    id: `event:${rule.id}:${logicalKey}`,
    ruleId: rule.id,
    title: rule.title,
    occursOn,
    startsAt: null,
    endsAt: null,
    solarLabel: occursOn,
    lunarLabel: "",
    status: "scheduled",
    algorithmVersion: vnLunarAdapter.algorithmVersion,
    isDemo: false,
    logicalKey,
    canAutoNotify: rule.reviewStatus === "approved",
    policyVersion,
    ruleVersion: rule.version,
    overrideReason: null,
    overrideVersion: 0,
  };
}

function sourceDateParts(
  rule: EventRule,
  calendar: "gregorian" | "vietnamese_lunar",
): { month: number; day: number; year?: number } | null {
  if (rule.sourceDate.calendar !== calendar) return null;
  const { month, day, year } = rule.sourceDate;
  if (month === undefined || day === undefined) return null;
  return { month, day, ...(year === undefined ? {} : { year }) };
}

function buildAnnualSolarOccurrences(
  rule: EventRule,
  start: SolarDate,
  end: SolarDate,
  policyVersion: string,
): {
  occurrences: Array<PlannedOccurrence>;
  blockedReasons: Array<RecurrencePlanBlockReason>;
} {
  const parts = sourceDateParts(rule, "gregorian");
  if (!parts) return { occurrences: [], blockedReasons: ["source_date_not_lunar"] };
  const occurrences: Array<PlannedOccurrence> = [];
  const blockedReasons: Array<RecurrencePlanBlockReason> = [];
  for (let year = start.year; year <= end.year; year += 1) {
    let day = parts.day;
    let month = parts.month;
    const monthLength = daysInGregorianMonth(year, month);
    if (day > monthLength) {
      const policy = rule.shortMonthPolicy ?? "last_day";
      if (policy === "skip") continue;
      if (policy === "manual_override") {
        blockedReasons.push("manual_override_required");
        continue;
      }
      if (policy === "last_day") day = monthLength;
      if (policy === "next_month_first") {
        const first = { year, month, day: 1 };
        const next = addSolarDays(first, monthLength);
        month = next.month;
        day = next.day;
      }
    }
    const candidate = { year, month, day };
    if (compareSolarDate(candidate, start) < 0 || compareSolarDate(candidate, end) > 0) continue;
    occurrences.push(createSolarOccurrence(rule, candidate, policyVersion));
  }
  return { occurrences, blockedReasons };
}

export function occurrencesBetween(
  rule: EventRule,
  startDate: string,
  endDate: string,
  policyVersion: string,
): OccurrenceQueryResult {
  const start = parseCivilDate(startDate);
  const end = parseCivilDate(endDate);
  if (!start || !end || compareSolarDate(start, end) > 0) {
    return {
      occurrences: [],
      blockedReasons: ["invalid_query_range"],
      algorithmVersion: vnLunarAdapter.algorithmVersion,
      policyVersion,
    };
  }

  if (rule.recurrence === "annual_solar") {
    const solar = buildAnnualSolarOccurrences(rule, start, end, policyVersion);
    return {
      occurrences: solar.occurrences,
      blockedReasons: solar.blockedReasons,
      algorithmVersion: vnLunarAdapter.algorithmVersion,
      policyVersion,
    };
  }

  if (rule.recurrence === "once") {
    const parts = sourceDateParts(rule, "gregorian");
    if (!parts || parts.year === undefined) {
      return {
        occurrences: [],
        blockedReasons: ["source_date_incomplete"],
        algorithmVersion: vnLunarAdapter.algorithmVersion,
        policyVersion,
      };
    }
    const candidate = { year: parts.year, month: parts.month, day: parts.day };
    return {
      occurrences:
        compareSolarDate(candidate, start) >= 0 && compareSolarDate(candidate, end) <= 0
          ? [createSolarOccurrence(rule, candidate, policyVersion)]
          : [],
      blockedReasons: [],
      algorithmVersion: vnLunarAdapter.algorithmVersion,
      policyVersion,
    };
  }

  const blockedReasons: Array<RecurrencePlanBlockReason> = [];
  const occurrences = new Map<string, PlannedOccurrence>();
  const firstLunarYear = Math.max(1900, start.year - 1);
  const lastLunarYear = Math.min(2099, end.year + 1);
  for (let lunarYear = firstLunarYear; lunarYear <= lastLunarYear; lunarYear += 1) {
    const recurrenceInput: LunarRecurrenceInput = {
      sourceDate: rule.sourceDate,
      recurrence: "annual_lunar",
      reviewStatus: rule.reviewStatus,
      targetLunarYear: lunarYear,
      ...(rule.leapPolicy ? { leapPolicy: rule.leapPolicy } : {}),
      ...(rule.shortMonthPolicy ? { shortMonthPolicy: rule.shortMonthPolicy } : {}),
    };
    const plan = planAnnualLunarRecurrence(recurrenceInput);
    if (plan.status === "blocked") {
      if (!blockedReasons.includes(plan.reason)) blockedReasons.push(plan.reason);
      continue;
    }
    for (const candidate of plan.candidates) {
      if (candidate.solarDate.year < start.year || candidate.solarDate.year > end.year) continue;
      if (compareSolarDate(candidate.solarDate, start) < 0 || compareSolarDate(candidate.solarDate, end) > 0) continue;
      const occurrence = createLunarOccurrence(rule, candidate, policyVersion);
      occurrences.set(occurrence.logicalKey, occurrence);
    }
  }

  return {
    occurrences: [...occurrences.values()].sort(
      (left, right) => left.occursOn.localeCompare(right.occursOn) || left.logicalKey.localeCompare(right.logicalKey),
    ),
    blockedReasons,
    algorithmVersion: vnLunarAdapter.algorithmVersion,
    policyVersion,
  };
}
export type OccurrenceOverrideInput = {
  logicalKey: string;
  occursOn: string;
  reason: string;
  approvedBy: string;
  version: number;
};

export function applyOccurrenceOverride(
  occurrence: PlannedOccurrence,
  override: OccurrenceOverrideInput,
): PlannedOccurrence {
  const solarDate = parseCivilDate(override.occursOn);
  if (!solarDate) throw new RangeError("override occursOn must be a supported ISO civil date");
  if (override.logicalKey !== occurrence.logicalKey) {
    throw new RangeError("override logicalKey must match the existing occurrence");
  }
  if (override.reason.trim().length < 5) {
    throw new RangeError("override reason is required");
  }
  if (override.approvedBy.trim().length < 1) {
    throw new RangeError("override approver is required");
  }
  if (!Number.isInteger(override.version) || override.version <= occurrence.overrideVersion) {
    throw new RangeError("override version must increase monotonically");
  }
  return {
    ...occurrence,
    occursOn: solarDateToString(solarDate),
    solarLabel: solarDateToString(solarDate),
    overrideReason: override.reason.trim(),
    overrideVersion: override.version,
  };
}

export function dedupeOccurrencesByLogicalKey(
  occurrences: ReadonlyArray<PlannedOccurrence>,
): ReadonlyArray<PlannedOccurrence> {
  const byKey = new Map<string, PlannedOccurrence>();
  for (const occurrence of occurrences) {
    const current = byKey.get(occurrence.logicalKey);
    if (
      !current ||
      occurrence.ruleVersion > current.ruleVersion ||
      (occurrence.ruleVersion === current.ruleVersion &&
        occurrence.overrideVersion > current.overrideVersion)
    ) {
      byKey.set(occurrence.logicalKey, occurrence);
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.occursOn.localeCompare(right.occursOn) ||
      left.logicalKey.localeCompare(right.logicalKey),
  );
}

export function applyOccurrenceOverrides(
  occurrences: ReadonlyArray<PlannedOccurrence>,
  overrides: ReadonlyArray<OccurrenceOverrideInput>,
): ReadonlyArray<PlannedOccurrence> {
  const byKey = new Map(overrides.map((override) => [override.logicalKey, override]));
  const updated = occurrences.map((occurrence) => {
    const override = byKey.get(occurrence.logicalKey);
    return override ? applyOccurrenceOverride(occurrence, override) : occurrence;
  });
  return dedupeOccurrencesByLogicalKey(updated);
}