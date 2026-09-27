import { describe, expect, it } from "vitest";
import {
  applyRSVPMutation,
  projectRSVPForViewer,
  summarizeRSVPsForViewer,
  validateRSVPInput,
  type RSVPCommand,
  type RSVPRecord,
} from "./m10-rsvp";

function command(overrides: Partial<RSVPCommand> = {}): RSVPCommand {
  return {
    occurrenceId: "occurrence-1",
    membershipId: "member-1",
    idempotencyKey: "key-1",
    baseVersion: null,
    input: { response: "yes", headcount: 1, note: "  Có mặt  " },
    ...overrides,
  };
}

function created(commandValue = command()): RSVPRecord {
  const result = applyRSVPMutation(null, commandValue);
  if (result.status === "conflict") throw new Error("fixture must create");
  return result.record;
}

describe("M10-05 RSVP", () => {
  it("creates then updates an RSVP with optimistic versioning", () => {
    const first = created();
    expect(first).toEqual(expect.objectContaining({
      id: "rsvp:occurrence-1:member-1",
      version: 1,
      response: "yes",
      headcount: 1,
      note: "Có mặt",
    }));

    const updated = applyRSVPMutation(first, command({
      idempotencyKey: "key-2",
      baseVersion: 1,
      input: { response: "maybe", headcount: 2, note: "Đang sắp xếp" },
    }));
    expect(updated).toEqual({
      status: "updated",
      record: expect.objectContaining({
        id: first.id,
        version: 2,
        response: "maybe",
        headcount: 2,
      }),
    });
  });

  it("replays the same idempotency key and rejects a reused key with changed payload", () => {
    const first = created();
    expect(applyRSVPMutation(first, command())).toEqual({
      status: "replayed",
      record: first,
    });

    const conflict = applyRSVPMutation(first, command({
      input: { response: "no", headcount: 0, note: "" },
    }));
    expect(conflict).toEqual({
      status: "conflict",
      record: first,
      reason: "idempotency_key_reused",
    });
  });

  it("rejects stale writes instead of silently overwriting another response", () => {
    const first = created();
    const stale = applyRSVPMutation(first, command({
      idempotencyKey: "key-2",
      baseVersion: null,
      input: { response: "no", headcount: 0, note: "" },
    }));
    expect(stale).toEqual({
      status: "conflict",
      record: first,
      reason: "version_conflict",
    });
  });

  it("validates response, headcount and restricted note at the domain boundary", () => {
    expect(validateRSVPInput({ response: "yes", headcount: 21, note: "" })).toContain("headcount_out_of_range");
    expect(validateRSVPInput({ response: "maybe", headcount: 0, note: "x".repeat(2001) })).toContain("note_too_long");
    expect(() => applyRSVPMutation(null, command({
      input: { response: "no", headcount: 21, note: "" },
    }))).toThrow("headcount_out_of_range");
  });

  it("never exposes a private RSVP record to member or public viewers", () => {
    const record = created();
    expect(projectRSVPForViewer(record, "self")).toEqual(record);
    expect(projectRSVPForViewer(record, "event_manager")).toEqual(record);
    expect(projectRSVPForViewer(record, "member")).toBeNull();
    expect(projectRSVPForViewer(record, "public")).toBeNull();
  });

  it("only exposes aggregate RSVP totals to an event manager", () => {
    const records = [
      created(),
      created(command({
        membershipId: "member-2",
        idempotencyKey: "key-3",
        input: { response: "no", headcount: 0, note: "" },
      })),
      created(command({
        membershipId: "member-3",
        idempotencyKey: "key-4",
        input: { response: "maybe", headcount: 2, note: "Chưa chắc" },
      })),
    ];
    expect(summarizeRSVPsForViewer(records, "event_manager")).toEqual({
      visible: true,
      totals: { yes: 1, no: 1, maybe: 1, headcount: 3 },
    });
    expect(summarizeRSVPsForViewer(records, "public")).toEqual({ visible: false });
  });
});
