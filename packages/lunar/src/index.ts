export type CalendarDate = { year: number; month: number; day: number; isLeapMonth?: boolean };

export type LunarCalendarAdapter = {
  algorithmVersion: string;
  supportedRange: { from: number; to: number };
  solarToLunar(value: CalendarDate): CalendarDate;
  lunarToSolar(value: CalendarDate): CalendarDate;
};

export const unconfiguredLunarAdapter: LunarCalendarAdapter = {
  algorithmVersion: "unconfigured",
  supportedRange: { from: 1900, to: 2099 },
  solarToLunar: () => { throw new Error("LUNAR_ADAPTER_NOT_CONFIGURED"); },
  lunarToSolar: () => { throw new Error("LUNAR_ADAPTER_NOT_CONFIGURED"); }
};
