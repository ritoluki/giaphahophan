import { describe, expect, it } from "vitest";
import { vnLunarAdapter } from "@phan/lunar";
import type { EventRule } from "@phan/contracts";
import {
  occurrencesBetween,
  planAnnualLunarRecurrence,
  type LunarRecurrenceInput,
} from "./m10";

function input(
  overrides: Partial<LunarRecurrenceInput> = {},
): LunarRecurrenceInput {
  return {
    recurrence: "annual_lunar",
    reviewStatus: "approved",
    leapPolicy: "regular_only",
    shortMonthPolicy: "last_day",
    targetLunarYear: 2023,
    sourceDate: {
      calendar: "vietnamese_lunar",
      precision: "month_day",
      month: 2,
      day: 15,
      originalText: "Ngày 15 tháng 2 âm lịch",
    },
    ...overrides,
  };
}

describe("M10-02 recurrence policy", () => {
  it("creates regular-only recurrence without mutating the source date", () => {
    const source = input({
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "month_day",
        month: 2,
        day: 15,
        originalText: "Ngày 15 tháng 2 âm lịch",
      },
    });
    const plan = planAnnualLunarRecurrence(source);

    expect(plan.status).toBe("ready");
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.requestedLunarDate).toEqual({
      year: 2023,
      month: 2,
      day: 15,
      isLeapMonth: false,
    });
    expect(plan.candidates[0]?.resolvedLunarDate).toEqual(
      plan.candidates[0]?.requestedLunarDate,
    );
    expect(source.sourceDate.day).toBe(15);
  });

  it("implements leap_only_skip, prefer_leap_else_regular, and both_if_exists", () => {
    const leapOnly = planAnnualLunarRecurrence(input({
      leapPolicy: "leap_only_skip",
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "month_day",
        month: 2,
        day: 15,
        originalText: "Ngày 15 tháng 2 âm lịch",
      },
    }));
    expect(leapOnly.status).toBe("ready");
    expect(leapOnly.candidates[0]?.resolvedLunarDate.isLeapMonth).toBe(true);

    const skipped = planAnnualLunarRecurrence(input({
      targetLunarYear: 2024,
      leapPolicy: "leap_only_skip",
    }));
    expect(skipped).toEqual(expect.objectContaining({
      status: "skipped",
      reason: "no_matching_leap_month",
      canAutoNotify: false,
    }));

    const preferred = planAnnualLunarRecurrence(input({
      leapPolicy: "prefer_leap_else_regular",
    }));
    expect(preferred.status).toBe("ready");
    expect(preferred.candidates).toHaveLength(1);
    expect(preferred.candidates[0]?.resolvedLunarDate.isLeapMonth).toBe(true);

    const both = planAnnualLunarRecurrence(input({
      leapPolicy: "both_if_exists",
    }));
    expect(both.status).toBe("ready");
    expect(both.candidates).toHaveLength(2);
    expect(new Set(both.candidates.map((candidate) => candidate.logicalKey)).size).toBe(2);
    expect(both.candidates.map((candidate) => candidate.resolvedLunarDate.isLeapMonth)).toEqual([false, true]);
  });

  it("resolves a 30th day in a short lunar month using explicit policies", () => {
    const sourceDate = {
      calendar: "vietnamese_lunar" as const,
      precision: "month_day" as const,
      month: 1,
      day: 30,
      originalText: "Ngày 30 tháng Giêng âm lịch",
    };

    const lastDay = planAnnualLunarRecurrence(input({
      targetLunarYear: 2024,
      sourceDate,
      shortMonthPolicy: "last_day",
    }));
    expect(lastDay.status).toBe("ready");
    expect(lastDay.candidates[0]?.adjustment).toBe("last_day");
    expect(lastDay.candidates[0]?.resolvedLunarDate.day).toBe(
      vnLunarAdapter.getMonthLength(2024, 1, false),
    );

    const nextMonth = planAnnualLunarRecurrence(input({
      targetLunarYear: 2024,
      sourceDate,
      shortMonthPolicy: "next_month_first",
    }));
    expect(nextMonth.status).toBe("ready");
    expect(nextMonth.candidates[0]?.adjustment).toBe("next_month_first");
    expect(nextMonth.candidates[0]?.resolvedLunarDate).toEqual({
      year: 2024,
      month: 2,
      day: 1,
      isLeapMonth: false,
    });

    const skipped = planAnnualLunarRecurrence(input({
      targetLunarYear: 2024,
      sourceDate,
      shortMonthPolicy: "skip",
    }));
    expect(skipped).toEqual(expect.objectContaining({
      status: "skipped",
      reason: "short_month_skipped",
    }));

    const manual = planAnnualLunarRecurrence(input({
      targetLunarYear: 2024,
      sourceDate,
      shortMonthPolicy: "manual_override",
    }));
    expect(manual).toEqual(expect.objectContaining({
      status: "blocked",
      reason: "manual_override_required",
      canAutoNotify: false,
    }));
  });

  it("blocks an unreviewed leap source from automatic notification", () => {
    const blocked = planAnnualLunarRecurrence(input({
      reviewStatus: "needs_review",
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "exact",
        month: 2,
        day: 15,
        isLeapMonth: true,
        originalText: "Ngày 15 tháng 2 nhuận",
      },
    }));
    expect(blocked).toEqual(expect.objectContaining({
      status: "blocked",
      reason: "source_leap_needs_review",
      canAutoNotify: false,
    }));

    const approved = planAnnualLunarRecurrence(input({
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "exact",
        month: 2,
        day: 15,
        isLeapMonth: true,
        originalText: "Ngày 15 tháng 2 nhuận",
      },
    }));
    expect(approved.status).toBe("ready");
    expect(approved.canAutoNotify).toBe(true);
  });

  it("blocks incomplete/non-lunar source dates and unsupported years", () => {
    expect(planAnnualLunarRecurrence(input({
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "year",
        year: 2023,
        originalText: "Năm 2023 âm lịch",
      },
    }))).toEqual(expect.objectContaining({
      status: "blocked",
      reason: "source_date_incomplete",
    }));

    expect(planAnnualLunarRecurrence(input({
      sourceDate: {
        calendar: "gregorian",
        precision: "exact",
        year: 2020,
        month: 1,
        day: 1,
        originalText: "01/01/2020",
      },
    }))).toEqual(expect.objectContaining({
      status: "blocked",
      reason: "source_date_not_lunar",
    }));

    expect(planAnnualLunarRecurrence(input({
      targetLunarYear: 2100,
    }))).toEqual(expect.objectContaining({
      status: "blocked",
      reason: "target_year_out_of_range",
    }));
  });

  it("does not enable automatic notification for an unapproved non-leap source", () => {
    const plan = planAnnualLunarRecurrence(input({ reviewStatus: "needs_review" }));
    expect(plan.status).toBe("ready");
    expect(plan.canAutoNotify).toBe(false);
    expect(plan.candidates[0]?.canAutoNotify).toBe(false);
  });
});

function eventRule(overrides: Partial<EventRule> = {}): EventRule {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    version: 3,
    reviewStatus: "approved",
    title: "Ngày giỗ cụ",
    kind: "death_anniversary",
    sourceDate: {
      calendar: "vietnamese_lunar",
      precision: "month_day",
      year: 1950,
      month: 1,
      day: 1,
      originalText: "Mùng 1 tháng Giêng âm lịch năm 1950",
    },
    recurrence: "annual_lunar",
    leapPolicy: "regular_only",
    shortMonthPolicy: "last_day",
    timezone: "Asia/Ho_Chi_Minh",
    visibility: "members",
    ...overrides,
  };
}

describe("M10-03 occurrencesBetween", () => {
  it("queries lunar years around a solar range and keeps the rule as the source", () => {
    const rule = eventRule({
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "month_day",
        year: 1950,
        month: 12,
        day: 20,
        originalText: "Ngày 20 tháng Chạp âm lịch năm 1950",
      },
    });
    const result = occurrencesBetween(rule, "2023-01-01", "2023-01-31", "policy-v1");

    expect(result.blockedReasons).toEqual([]);
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]).toEqual(expect.objectContaining({
      ruleId: rule.id,
      occursOn: "2023-01-11",
      policyVersion: "policy-v1",
      status: "scheduled",
    }));
    expect(result.occurrences[0]?.lunarLabel).toContain("2022");
    expect(result.occurrences[0]?.algorithmVersion).toBe(vnLunarAdapter.algorithmVersion);
  });

  it("does not use source lunar year as the recurrence target year", () => {
    const rule = eventRule();
    const result = occurrencesBetween(rule, "2023-01-01", "2023-12-31", "policy-v1");

    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]?.occursOn).toBe("2023-01-22");
    expect(result.occurrences[0]?.logicalKey).toContain("2023");
  });

  it("deduplicates stable logical keys when ranges overlap", () => {
    const rule = eventRule({
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "month_day",
        month: 2,
        day: 15,
        originalText: "Ngày 15 tháng 2 âm lịch",
      },
      leapPolicy: "both_if_exists",
    });
    const first = occurrencesBetween(rule, "2023-01-01", "2023-05-31", "policy-v1");
    const wider = occurrencesBetween(rule, "2023-01-01", "2024-05-31", "policy-v1");

    expect(first.occurrences).toHaveLength(2);
    expect(new Set(first.occurrences.map((occurrence) => occurrence.logicalKey)).size).toBe(2);
    expect(new Set(wider.occurrences.map((occurrence) => occurrence.id)).size).toBe(wider.occurrences.length);
    expect(wider.occurrences.filter((occurrence) => occurrence.occursOn === "2023-03-06")).toHaveLength(1);
    expect(wider.occurrences.filter((occurrence) => occurrence.occursOn === "2023-04-05")).toHaveLength(1);
  });

  it("does not produce occurrences or automatic notification for unreviewed leap source", () => {
    const rule = eventRule({
      reviewStatus: "needs_review",
      sourceDate: {
        calendar: "vietnamese_lunar",
        precision: "exact",
        month: 2,
        day: 15,
        isLeapMonth: true,
        originalText: "Ngày 15 tháng 2 nhuận",
      },
    });
    const result = occurrencesBetween(rule, "2023-01-01", "2023-12-31", "policy-v1");

    expect(result.occurrences).toEqual([]);
    expect(result.blockedReasons).toContain("source_leap_needs_review");
  });

  it("supports once and annual solar rules without rewriting their source rule", () => {
    const once = occurrencesBetween(eventRule({
      recurrence: "once",
      sourceDate: {
        calendar: "gregorian",
        precision: "exact",
        year: 2023,
        month: 6,
        day: 12,
        originalText: "12/06/2023",
      },
    }), "2023-06-01", "2023-06-30", "policy-v1");
    expect(once.occurrences).toHaveLength(1);
    expect(once.occurrences[0]?.occursOn).toBe("2023-06-12");

    const solar = occurrencesBetween(eventRule({
      recurrence: "annual_solar",
      sourceDate: {
        calendar: "gregorian",
        precision: "month_day",
        month: 2,
        day: 29,
        originalText: "29/02",
      },
    }), "2023-01-01", "2024-12-31", "policy-v1");
    expect(solar.occurrences.map((occurrence) => occurrence.occursOn)).toEqual([
      "2023-02-28",
      "2024-02-29",
    ]);
  });

  it("returns a safe result for invalid query range", () => {
    const result = occurrencesBetween(eventRule(), "2023-02-30", "2023-01-01", "policy-v1");
    expect(result).toEqual(expect.objectContaining({
      occurrences: [],
      blockedReasons: ["invalid_query_range"],
    }));
  });
});