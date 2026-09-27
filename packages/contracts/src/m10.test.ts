import { describe, expect, it } from "vitest";
import {
  rsvpInputSchema,
  rsvpMutationInputSchema,
  rsvpRecordSchema,
} from "./index";

describe("M10-05 RSVP contracts", () => {
  it("accepts bounded input and defaults an empty restricted note", () => {
    expect(rsvpInputSchema.parse({
      response: "yes",
      headcount: 2,
    })).toEqual({ response: "yes", headcount: 2, note: "" });
  });

  it("rejects headcount outside the data dictionary bound", () => {
    expect(() => rsvpInputSchema.parse({
      response: "maybe",
      headcount: 21,
      note: "",
    })).toThrow();
  });

  it("requires an idempotency key and occurrence id at the mutation boundary", () => {
    const parsed = rsvpMutationInputSchema.parse({
      occurrenceId: "50000000-0000-4000-8000-000000000001",
      idempotencyKey: "60000000-0000-4000-8000-000000000001",
      response: "no",
      headcount: 0,
      note: "Không tham dự",
    });
    expect(parsed.baseVersion).toBeNull();
  });

  it("keeps record note as a bounded string", () => {
    expect(rsvpRecordSchema.parse({
      id: "rsvp-1",
      occurrenceId: "occurrence-1",
      membershipId: "member-1",
      version: 1,
      response: "yes",
      headcount: 1,
      note: "",
      idempotencyKey: "key-1",
    }).version).toBe(1);
  });
});
