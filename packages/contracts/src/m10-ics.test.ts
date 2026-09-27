import { describe, expect, it } from "vitest";
import { icsExportInputSchema } from "./index";
describe("M10-06 ICS contracts", () => {
  it("accepts scoped export with deterministic timestamp", () => {
    expect(icsExportInputSchema.parse({ occurrenceIds: ["event:rule-1:solar:2024-02-09"], scope: "self", generatedAt: "20260928T080000Z" })).toEqual({
      occurrenceIds: ["event:rule-1:solar:2024-02-09"], scope: "self", generatedAt: "20260928T080000Z",
    });
  });
  it("rejects public feeds at the contract boundary", () => {
    expect(() => icsExportInputSchema.parse({ occurrenceIds: ["event-1"], scope: "public_feed", generatedAt: "20260928T080000Z" })).toThrow();
  });
  it("rejects an invalid timestamp", () => {
    expect(() => icsExportInputSchema.parse({ occurrenceIds: ["event-1"], scope: "members", generatedAt: "now" })).toThrow();
  });
});
