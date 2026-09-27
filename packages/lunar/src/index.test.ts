import { describe, expect, it } from "vitest";
import {
  LunarCalendarError,
  vnLunarAdapter,
  type LunarDate,
  type SolarDate,
} from "../src/index";
import {
  lunarToSolar as independentLunarToSolar,
  solarToLunar as independentSolarToLunar,
} from "@baostudio/viet-lunar";

type GoldenCase = {
  solar: SolarDate;
  lunar: LunarDate;
};

const goldenCases: GoldenCase[] = [
  { solar: { year: 1900, month: 1, day: 31 }, lunar: { year: 1900, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 1900, month: 2, day: 1 }, lunar: { year: 1900, month: 1, day: 2, isLeapMonth: false } },
  { solar: { year: 1900, month: 8, day: 25 }, lunar: { year: 1900, month: 8, day: 1, isLeapMonth: false } },
  { solar: { year: 1954, month: 1, day: 1 }, lunar: { year: 1953, month: 11, day: 27, isLeapMonth: false } },
  { solar: { year: 1967, month: 8, day: 8 }, lunar: { year: 1967, month: 7, day: 3, isLeapMonth: false } },
  { solar: { year: 1968, month: 2, day: 6 }, lunar: { year: 1968, month: 1, day: 9, isLeapMonth: false } },
  { solar: { year: 1967, month: 1, day: 30 }, lunar: { year: 1966, month: 12, day: 20, isLeapMonth: false } },
  { solar: { year: 1985, month: 1, day: 21 }, lunar: { year: 1985, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 1999, month: 12, day: 31 }, lunar: { year: 1999, month: 11, day: 24, isLeapMonth: false } },
  { solar: { year: 2000, month: 2, day: 29 }, lunar: { year: 2000, month: 1, day: 25, isLeapMonth: false } },
  { solar: { year: 2000, month: 3, day: 1 }, lunar: { year: 2000, month: 1, day: 26, isLeapMonth: false } },
  { solar: { year: 2004, month: 2, day: 29 }, lunar: { year: 2004, month: 2, day: 10, isLeapMonth: false } },
  { solar: { year: 2007, month: 2, day: 17 }, lunar: { year: 2007, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2010, month: 2, day: 14 }, lunar: { year: 2010, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2012, month: 1, day: 23 }, lunar: { year: 2012, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2013, month: 2, day: 10 }, lunar: { year: 2013, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2014, month: 1, day: 31 }, lunar: { year: 2014, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2015, month: 2, day: 19 }, lunar: { year: 2015, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2016, month: 2, day: 8 }, lunar: { year: 2016, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2017, month: 1, day: 28 }, lunar: { year: 2017, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2018, month: 2, day: 16 }, lunar: { year: 2018, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2019, month: 2, day: 5 }, lunar: { year: 2019, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2020, month: 1, day: 25 }, lunar: { year: 2020, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2020, month: 6, day: 4 }, lunar: { year: 2020, month: 4, day: 13, isLeapMonth: true } },
  { solar: { year: 2020, month: 7, day: 19 }, lunar: { year: 2020, month: 5, day: 29, isLeapMonth: false } },
  { solar: { year: 2021, month: 2, day: 12 }, lunar: { year: 2021, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2022, month: 2, day: 1 }, lunar: { year: 2022, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2023, month: 1, day: 22 }, lunar: { year: 2023, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2023, month: 4, day: 12 }, lunar: { year: 2023, month: 2, day: 22, isLeapMonth: true } },
  { solar: { year: 2023, month: 5, day: 10 }, lunar: { year: 2023, month: 3, day: 21, isLeapMonth: false } },
  { solar: { year: 2024, month: 2, day: 10 }, lunar: { year: 2024, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2024, month: 9, day: 17 }, lunar: { year: 2024, month: 8, day: 15, isLeapMonth: false } },
  { solar: { year: 2025, month: 1, day: 29 }, lunar: { year: 2025, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2025, month: 6, day: 25 }, lunar: { year: 2025, month: 6, day: 1, isLeapMonth: false } },
  { solar: { year: 2025, month: 7, day: 24 }, lunar: { year: 2025, month: 6, day: 30, isLeapMonth: false } },
  { solar: { year: 2026, month: 2, day: 17 }, lunar: { year: 2026, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2027, month: 2, day: 6 }, lunar: { year: 2027, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2028, month: 1, day: 26 }, lunar: { year: 2028, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2028, month: 5, day: 21 }, lunar: { year: 2028, month: 4, day: 27, isLeapMonth: false } },
  { solar: { year: 2028, month: 6, day: 19 }, lunar: { year: 2028, month: 5, day: 27, isLeapMonth: false } },
  { solar: { year: 2029, month: 2, day: 13 }, lunar: { year: 2029, month: 1, day: 1, isLeapMonth: false } },
  { solar: { year: 2030, month: 2, day: 3 }, lunar: { year: 2030, month: 1, day: 2, isLeapMonth: false } },
  { solar: { year: 2099, month: 2, day: 28 }, lunar: { year: 2099, month: 2, day: 9, isLeapMonth: false } },
  { solar: { year: 2099, month: 12, day: 31 }, lunar: { year: 2099, month: 11, day: 20, isLeapMonth: false } },
];

describe("M10-01 Vietnamese lunar adapter", () => {
  it("passes the 40+ date golden set against two independent implementations", () => {
    expect(goldenCases.length).toBeGreaterThanOrEqual(40);

    for (const fixture of goldenCases) {
      expect(vnLunarAdapter.solarToLunar(fixture.solar)).toEqual(fixture.lunar);
      expect(independentSolarToLunar(fixture.solar)).toEqual({
        year: fixture.lunar.year,
        month: fixture.lunar.month,
        day: fixture.lunar.day,
        leapMonth: fixture.lunar.isLeapMonth,
      });
    }
  });

  it("keeps leap month metadata and month lengths exact", () => {
    expect(vnLunarAdapter.getLeapMonth(2020)).toBe(4);
    expect(vnLunarAdapter.getLeapMonth(2023)).toBe(2);
    expect(vnLunarAdapter.getLeapMonth(2024)).toBeNull();
    expect(vnLunarAdapter.getLeapMonth(2025)).toBe(6);
    expect(vnLunarAdapter.getMonthLength(2023, 2, false)).toBe(30);
    expect(vnLunarAdapter.getMonthLength(2023, 2, true)).toBe(29);
    expect(vnLunarAdapter.getMonthLength(2024, 1, false)).toBe(29);
  });

  it("round-trips solar and lunar dates without JavaScript Date timezone behavior", () => {
    for (const fixture of goldenCases) {
      expect(vnLunarAdapter.lunarToSolar(fixture.lunar)).toEqual(fixture.solar);
      expect(independentLunarToSolar({
        year: fixture.lunar.year,
        month: fixture.lunar.month,
        day: fixture.lunar.day,
        leapMonth: fixture.lunar.isLeapMonth,
      })).toEqual(fixture.solar);
    }

    for (let year = 1901; year <= 2099; year += 11) {
      for (let month = 1; month <= 12; month += 3) {
        const solar = { year, month, day: 15 };
        const lunar = vnLunarAdapter.solarToLunar(solar);
        expect(vnLunarAdapter.lunarToSolar(lunar)).toEqual(solar);
      }
      const leapMonth = vnLunarAdapter.getLeapMonth(year);
      if (leapMonth !== null) {
        const lunar = {
          year,
          month: leapMonth,
          day: 1,
          isLeapMonth: true,
        };
        expect(vnLunarAdapter.lunarToSolar(lunar)).toEqual(
          expect.objectContaining({ year }),
        );
      }
    }
  });

  it("rejects invalid dates, invalid leap months, and unsupported years", () => {
    const expectCode = (
      action: () => unknown,
      code: LunarCalendarError["code"],
    ) => {
      expect(action).toThrowError(
        expect.objectContaining({ name: "LunarCalendarError", code }),
      );
    };

    expectCode(
      () => vnLunarAdapter.solarToLunar({ year: 2023, month: 2, day: 29 }),
      "INVALID_CALENDAR_DATE",
    );
    expectCode(
      () => vnLunarAdapter.solarToLunar({ year: 1899, month: 12, day: 31 }),
      "UNSUPPORTED_CALENDAR_YEAR",
    );
    expectCode(
      () => vnLunarAdapter.lunarToSolar({
        year: 2024,
        month: 2,
        day: 1,
        isLeapMonth: true,
      }),
      "INVALID_LUNAR_DATE",
    );
    expectCode(
      () => vnLunarAdapter.lunarToSolar({
        year: 2023,
        month: 2,
        day: 31,
        isLeapMonth: false,
      }),
      "INVALID_LUNAR_DATE",
    );
  });
});
