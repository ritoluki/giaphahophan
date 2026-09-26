import { describe, expect, it } from "vitest";
import { personProjectionSchema, proposalSubmitInputSchema } from "./index";

describe("CORE-01 contracts", () => {
  it("accepts the allowlisted person projection shape", () => {
    expect(personProjectionSchema.parse({
      id: "30000000-0000-4000-8000-000000000001",
      treeId: "10000000-0000-4000-8000-000000000001",
      code: "CORE-PUBLIC",
      displayName: "Synthetic Public Person",
      recordedSex: null,
      lifeStatus: "unknown",
      visibility: "public",
      protectedMinor: false,
      primaryBranchId: null,
      confidence: "unverified"
    }).code).toBe("CORE-PUBLIC");
  });

  it("does not accept client-supplied actor identity in proposal input", () => {
    const parsed = proposalSubmitInputSchema.safeParse({
      treeId: "10000000-0000-4000-8000-000000000001",
      kind: "correction",
      reason: "Synthetic correction",
      items: [{
        targetKind: "person",
        operation: "update",
        fieldChanges: { displayName: "Synthetic Updated Person" },
        sourceIds: []
      }],
      actorId: "20000000-0000-4000-8000-000000000001"
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("actorId");
  });
});
