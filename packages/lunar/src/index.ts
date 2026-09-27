import {
  getLunarDate,
  getSolarDate,
  getYearInfo,
} from "@dqcai/vn-lunar";

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
  isLeapMonth?: boolean;
};

export type LunarDate = CalendarDate & { isLeapMonth: boolean };
export type SolarDate = Omit<CalendarDate, "isLeapMonth">;

export type LunarCalendarAdapter = {
  algorithmVersion: string;
  supportedRange: { from: number; to: number };
  solarToLunar(value: SolarDate): LunarDate;
  lunarToSolar(value: LunarDate): SolarDate;
  getMonthLength(year: number, month: number, isLeapMonth?: boolean): number;
  getLeapMonth(year: number): number | null;
};

export class LunarCalendarError extends Error {
  readonly code:
    | "INVALID_CALENDAR_DATE"
    | "UNSUPPORTED_CALENDAR_YEAR"
    | "INVALID_LUNAR_DATE"
    | "LUNAR_DATE_CONVERSION_FAILED";

  constructor(
    code: LunarCalendarError["code"],
    message: string,
  ) {
    super(message);
    this.name = "LunarCalendarError";
    this.code = code;
  }
}

const SUPPORTED_RANGE = { from: 1900, to: 2099 } as const;
const ALGORITHM_VERSION = "@dqcai/vn-lunar@1.0.1-vn-utc7-adapter";

function fail(
  code: LunarCalendarError["code"],
  message: string,
): never {
  throw new LunarCalendarError(code, message);
}

function assertInteger(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    fail("INVALID_CALENDAR_DATE", `${field} must be an integer`);
  }
}

function assertSupportedYear(year: number): void {
  assertInteger(year, "year");
  if (year < SUPPORTED_RANGE.from || year > SUPPORTED_RANGE.to) {
    fail(
      "UNSUPPORTED_CALENDAR_YEAR",
      `calendar year must be between ${SUPPORTED_RANGE.from} and ${SUPPORTED_RANGE.to}`,
    );
  }
}

function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getGregorianMonthLength(year: number, month: number): number {
  const lengths = [31, isGregorianLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

function assertSolarDate(value: SolarDate): void {
  assertSupportedYear(value.year);
  assertInteger(value.month, "month");
  assertInteger(value.day, "day");
  if (value.month < 1 || value.month > 12) {
    fail("INVALID_CALENDAR_DATE", "solar month must be between 1 and 12");
  }
  const monthLength = getGregorianMonthLength(value.year, value.month);
  if (value.day < 1 || value.day > monthLength) {
    fail("INVALID_CALENDAR_DATE", "solar day is outside the month");
  }
}

function getYearMonths(year: number) {
  return getYearInfo(year).map((month) => ({
    month: month.month,
    isLeapMonth: month.leap,
    startJulianDay: month.jd,
  }));
}

function getMonthLength(
  year: number,
  month: number,
  isLeapMonth = false,
): number {
  assertSupportedYear(year);
  assertInteger(month, "month");
  if (month < 1 || month > 12) {
    fail("INVALID_LUNAR_DATE", "lunar month must be between 1 and 12");
  }
  const months = getYearMonths(year);
  const index = months.findIndex(
    (candidate) =>
      candidate.month === month && candidate.isLeapMonth === isLeapMonth,
  );
  if (index < 0) {
    fail(
      "INVALID_LUNAR_DATE",
      `lunar month ${month}${isLeapMonth ? " leap" : ""} does not exist in ${year}`,
    );
  }
  const current = months[index];
  if (!current) {
    fail("LUNAR_DATE_CONVERSION_FAILED", "cannot determine lunar month start");
  }
  const next = months[index + 1] ?? {
    startJulianDay: getYearInfo(year + 1)[0]?.jd,
  };
  if (next.startJulianDay === undefined) {
    fail("LUNAR_DATE_CONVERSION_FAILED", "cannot determine lunar month length");
  }
  return next.startJulianDay - current.startJulianDay;
}

function assertLunarDate(value: LunarDate): void {
  assertSupportedYear(value.year);
  assertInteger(value.month, "month");
  assertInteger(value.day, "day");
  const isLeapMonth = value.isLeapMonth ?? false;
  const monthLength = getMonthLength(value.year, value.month, isLeapMonth);
  if (value.day < 1 || value.day > monthLength) {
    fail("INVALID_LUNAR_DATE", "lunar day is outside the month");
  }
}

export const vnLunarAdapter: LunarCalendarAdapter = {
  algorithmVersion: ALGORITHM_VERSION,
  supportedRange: SUPPORTED_RANGE,

  solarToLunar(value) {
    assertSolarDate(value);
    const result = getLunarDate(value.day, value.month, value.year);
    assertSupportedYear(result.year);
    return {
      year: result.year,
      month: result.month,
      day: result.day,
      isLeapMonth: result.leap,
    };
  },

  lunarToSolar(value) {
    const normalized = { ...value, isLeapMonth: value.isLeapMonth ?? false };
    assertLunarDate(normalized);
    const result = getSolarDate(
      normalized.day,
      normalized.month,
      normalized.year,
      normalized.isLeapMonth,
    );
    const solar = { day: result.day, month: result.month, year: result.year };
    try {
      assertSolarDate(solar);
    } catch {
      fail("LUNAR_DATE_CONVERSION_FAILED", "lunar date did not convert to a supported solar date");
    }
    const roundTrip = this.solarToLunar(solar);
    if (
      roundTrip.year !== normalized.year ||
      roundTrip.month !== normalized.month ||
      roundTrip.day !== normalized.day ||
      roundTrip.isLeapMonth !== normalized.isLeapMonth
    ) {
      fail("LUNAR_DATE_CONVERSION_FAILED", "lunar conversion failed round-trip validation");
    }
    return solar;
  },

  getMonthLength,

  getLeapMonth(year) {
    assertSupportedYear(year);
    return getYearMonths(year).find((month) => month.isLeapMonth)?.month ?? null;
  },
};

export const unconfiguredLunarAdapter: LunarCalendarAdapter = {
  algorithmVersion: "unconfigured",
  supportedRange: SUPPORTED_RANGE,
  solarToLunar: () => { throw new Error("LUNAR_ADAPTER_NOT_CONFIGURED"); },
  lunarToSolar: () => { throw new Error("LUNAR_ADAPTER_NOT_CONFIGURED"); },
  getMonthLength: () => { throw new Error("LUNAR_ADAPTER_NOT_CONFIGURED"); },
  getLeapMonth: () => { throw new Error("LUNAR_ADAPTER_NOT_CONFIGURED"); },
};
