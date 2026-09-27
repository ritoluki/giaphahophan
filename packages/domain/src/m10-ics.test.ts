import { describe, expect, it } from "vitest";
import { exportOccurrencesToIcs } from "./m10-ics";
import type { PlannedOccurrence } from "./m10";

function occurrence(overrides: Partial<PlannedOccurrence> = {}): PlannedOccurrence {
  return {
    id: "event:rule-1:lunar:2024:1:1:regular", ruleId: "rule-1", title: "Ngay gio ho", occursOn: "2024-02-09",
    startsAt: null, endsAt: null, solarLabel: "2024-02-09", lunarLabel: "01/01/thuong/2024", status: "scheduled",
    algorithmVersion: "vn-lunar-1", isDemo: true, logicalKey: "lunar:2024:1:1:regular", canAutoNotify: true,
    policyVersion: "m10-v1", ruleVersion: 1, overrideReason: null, overrideVersion: 0, ...overrides,
  };
}
const options = { scope: "self" as const, authorized: true, generatedAt: "20260928T080000Z" };
describe("M10-06 ICS export", () => {
  it("exports solar all-day date with exclusive next-day DTEND", () => {
    const result = exportOccurrencesToIcs([occurrence()], options);
    expect(result.status).toBe("exported");
    if (result.status !== "exported") return;
    expect(result.calendar).toContain("DTSTART;VALUE=DATE:20240209");
    expect(result.calendar).toContain("DTEND;VALUE=DATE:20240210");
    expect(result.calendar).toContain("UID:occurrence-rule-1-lunar%3A2024%3A1%3A1%3Aregular@giaphapha.local");
  });
  it("keeps UID stable while sequence changes for rule or override versions", () => {
    const first = exportOccurrencesToIcs([occurrence()], { ...options, scope: "members" });
    const changed = exportOccurrencesToIcs([occurrence({ ruleVersion: 2, overrideVersion: 1 })], { ...options, scope: "members" });
    expect(first.status).toBe("exported"); expect(changed.status).toBe("exported");
    if (first.status !== "exported" || changed.status !== "exported") return;
    const uid = "UID:occurrence-rule-1-lunar%3A2024%3A1%3A1%3Aregular@giaphapha.local";
    expect(first.calendar).toContain(uid); expect(changed.calendar).toContain(uid);
    expect(first.calendar).toContain("SEQUENCE:0"); expect(changed.calendar).toContain("SEQUENCE:2");
  });
  it("does not export an unauthorized actor or public feed", () => {
    expect(exportOccurrencesToIcs([occurrence()], { ...options, authorized: false })).toEqual({ status: "denied", reason: "not_authorized" });
    expect(exportOccurrencesToIcs([occurrence()], { ...options, scope: "public_feed" })).toEqual({ status: "denied", reason: "public_feed_not_supported" });
  });
  it("renders cancellation and escapes event text without attendee data", () => {
    const result = exportOccurrencesToIcs([occurrence({ title: "Le; gio\nho", status: "cancelled" })], options);
    expect(result.status).toBe("exported");
    if (result.status !== "exported") return;
    expect(result.calendar).toContain("SUMMARY:Le\\; gio\\nho");
    expect(result.calendar).toContain("STATUS:CANCELLED");
    expect(result.calendar).not.toContain("RSVP"); expect(result.calendar).not.toContain("attendee");
  });
  it("rejects invalid dates and nondeterministic timestamps", () => {
    expect(exportOccurrencesToIcs([occurrence({ occursOn: "2024-02-30" })], options)).toEqual({ status: "invalid", reason: "invalid_occurrence_date" });
    expect(exportOccurrencesToIcs([occurrence()], { ...options, generatedAt: "now" })).toEqual({ status: "invalid", reason: "invalid_generated_at" });
  });
});

