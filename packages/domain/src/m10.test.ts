import { describe, expect, it } from "vitest";
import { vnLunarAdapter } from "@phan/lunar";
import {
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
