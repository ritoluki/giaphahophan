import type { EventRule, GenealogyDate } from "@phan/contracts";
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
