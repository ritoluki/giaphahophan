import { describe, expect, it } from "vitest";

import { evaluateNotificationPolicy, type NotificationPreference } from "./notification-policy";

const preference = (overrides: Partial<NotificationPreference> = {}): NotificationPreference => ({
  channel: "email", eventKind: "event.reminder", enabled: true, quietStartHour: 22, quietEndHour: 7,
  unsubscribed: false, suppressed: false, ...overrides,
});

describe("M11-03 notification privacy policy", () => {
  it("requires opt-in and rechecks consent at send time", () => {
    expect(evaluateNotificationPolicy(preference({ enabled: false }), { currentLocalHour: 10, consentAllowed: true })).toEqual({ status: "suppress", reason: "opt_in_required" });
    expect(evaluateNotificationPolicy(preference(), { currentLocalHour: 10, consentAllowed: false })).toEqual({ status: "suppress", reason: "consent_revoked" });
  });
  it("suppresses default quiet hours across midnight", () => {
    expect(evaluateNotificationPolicy(preference(), { currentLocalHour: 23, consentAllowed: true })).toEqual({ status: "suppress", reason: "quiet_hours" });
    expect(evaluateNotificationPolicy(preference(), { currentLocalHour: 6, consentAllowed: true })).toEqual({ status: "suppress", reason: "quiet_hours" });
    expect(evaluateNotificationPolicy(preference(), { currentLocalHour: 8, consentAllowed: true })).toEqual({ status: "send", channel: "email", eventKind: "event.reminder" });
  });
  it("honors unsubscribe and suppression before provider send", () => {
    expect(evaluateNotificationPolicy(preference({ unsubscribed: true }), { currentLocalHour: 10, consentAllowed: true })).toEqual({ status: "suppress", reason: "unsubscribed" });
    expect(evaluateNotificationPolicy(preference({ suppressed: true }), { currentLocalHour: 10, consentAllowed: true })).toEqual({ status: "suppress", reason: "suppressed" });
  });
  it("rejects invalid local hours instead of guessing a timezone", () => {
    expect(() => evaluateNotificationPolicy(preference(), { currentLocalHour: 24, consentAllowed: true })).toThrow(RangeError);
    expect(() => evaluateNotificationPolicy(preference({ quietStartHour: -1 }), { currentLocalHour: 10, consentAllowed: true })).toThrow(RangeError);
  });
});
