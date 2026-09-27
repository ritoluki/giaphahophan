import type { RSVPInput } from "@phan/contracts";

export type RSVPRecord = {
  id: string;
  occurrenceId: string;
  membershipId: string;
  version: number;
  response: RSVPInput["response"];
  headcount: number;
  note: string;
  idempotencyKey: string;
};

export type RSVPCommand = {
  occurrenceId: string;
  membershipId: string;
  idempotencyKey: string;
  baseVersion: number | null;
  input: RSVPInput;
};

export type RSVPMutationResult =
  | { status: "created" | "updated" | "replayed"; record: RSVPRecord }
  | {
      status: "conflict";
      record: RSVPRecord | null;
      reason: "idempotency_key_reused" | "version_conflict";
    };

export type RSVPViewer = "self" | "event_manager" | "member" | "public";

export type RSVPPrivateProjection = RSVPRecord;

export type RSVPEventSummary = {
  visible: true;
  totals: {
    yes: number;
    no: number;
    maybe: number;
    headcount: number;
  };
};

export type RSVPHiddenProjection = {
  visible: false;
};

export function validateRSVPInput(input: RSVPInput): string[] {
  const errors: string[] = [];
  if (!["yes", "no", "maybe"].includes(input.response)) {
    errors.push("response_invalid");
  }
  if (!Number.isInteger(input.headcount) || input.headcount < 0 || input.headcount > 20) {
    errors.push("headcount_out_of_range");
  }
  if (typeof input.note !== "string" || input.note.trim().length > 2000) {
    errors.push("note_too_long");
  }
  return errors;
}

function sameRSVPPayload(left: RSVPRecord, command: RSVPCommand): boolean {
  return (
    left.occurrenceId === command.occurrenceId &&
    left.membershipId === command.membershipId &&
    left.response === command.input.response &&
    left.headcount === command.input.headcount &&
    left.note === command.input.note.trim()
  );
}

export function applyRSVPMutation(
  existing: RSVPRecord | null,
  command: RSVPCommand,
): RSVPMutationResult {
  const errors = validateRSVPInput(command.input);
  if (errors.length > 0) {
    throw new RangeError(errors.join(","));
  }
  if (command.occurrenceId.trim().length === 0 || command.membershipId.trim().length === 0) {
    throw new RangeError("occurrence_and_membership_required");
  }
  if (command.idempotencyKey.trim().length === 0) {
    throw new RangeError("idempotency_key_required");
  }

  if (existing && existing.idempotencyKey === command.idempotencyKey) {
    return sameRSVPPayload(existing, command)
      ? { status: "replayed", record: existing }
      : {
          status: "conflict",
          record: existing,
          reason: "idempotency_key_reused",
        };
  }

  if (existing && command.baseVersion !== existing.version) {
    return {
      status: "conflict",
      record: existing,
      reason: "version_conflict",
    };
  }

  const record: RSVPRecord = {
    id: existing?.id ?? `rsvp:${command.occurrenceId}:${command.membershipId}`,
    occurrenceId: command.occurrenceId,
    membershipId: command.membershipId,
    version: existing ? existing.version + 1 : 1,
    response: command.input.response,
    headcount: command.input.headcount,
    note: command.input.note.trim(),
    idempotencyKey: command.idempotencyKey,
  };
  return {
    status: existing ? "updated" : "created",
    record,
  };
}

export function projectRSVPForViewer(
  record: RSVPRecord,
  viewer: RSVPViewer,
): RSVPPrivateProjection | null {
  return viewer === "self" || viewer === "event_manager" ? { ...record } : null;
}

export function summarizeRSVPsForViewer(
  records: ReadonlyArray<RSVPRecord>,
  viewer: RSVPViewer,
): RSVPEventSummary | RSVPHiddenProjection {
  if (viewer !== "event_manager") return { visible: false };
  return {
    visible: true,
    totals: records.reduce(
      (totals, record) => ({
        yes: totals.yes + (record.response === "yes" ? 1 : 0),
        no: totals.no + (record.response === "no" ? 1 : 0),
        maybe: totals.maybe + (record.response === "maybe" ? 1 : 0),
        headcount: totals.headcount + record.headcount,
      }),
      { yes: 0, no: 0, maybe: 0, headcount: 0 },
    ),
  };
}
