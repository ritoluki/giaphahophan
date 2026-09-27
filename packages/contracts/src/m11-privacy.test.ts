import { describe, expect, it } from "vitest";

import { notificationPreferenceSchema, notificationSendContextSchema } from "./index";

describe("M11-03 privacy preference contracts", () => {
  it("defaults quiet hours and requires explicit opt-in fields", () => {
    expect(notificationPreferenceSchema.parse({ channel: "email", eventKind: "event.reminder", enabled: false, unsubscribed: false, suppressed: false })).toEqual({
      channel: "email", eventKind: "event.reminder", enabled: false, quietStartHour: 22, quietEndHour: 7, unsubscribed: false, suppressed: false,
    });
  });
  it("bounds local hour and consent recheck context", () => {
    expect(notificationSendContextSchema.parse({ currentLocalHour: 8, consentAllowed: true })).toEqual({ currentLocalHour: 8, consentAllowed: true });
    expect(() => notificationSendContextSchema.parse({ currentLocalHour: 24, consentAllowed: true })).toThrow();
  });
});
