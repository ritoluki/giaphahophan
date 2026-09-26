import { describe, expect, it } from "vitest";
import { claimReviewInputSchema, claimSubmitInputSchema, personDeletionImpactSchema, personDeletionInputSchema, personIdentityProjectionSchema, personProjectionSchema, proposalSubmitInputSchema } from "./index";

describe("CORE-01 contracts", () => {
  it("accepts the allowlisted person projection shape", () => {
    expect(personProjectionSchema.parse({
      id: "30000000-0000-4000-8000-000000000001",
      treeId: "10000000-0000-4000-8000-000000000001",
      version: 1,
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

  it("keeps aliases as display data while UUID/code remain identity", () => {
    const parsed = personIdentityProjectionSchema.parse({
      id: "30000000-0000-4000-8000-000000000001",
      treeId: "10000000-0000-4000-8000-000000000001",
      version: 1,
      code: "CORE-PUBLIC",
      displayName: "Synthetic Public Person",
      recordedSex: null,
      lifeStatus: "unknown",
      visibility: "public",
      protectedMinor: false,
      primaryBranchId: null,
      confidence: "unverified",
      names: [
        {
          id: "50000000-0000-4000-8000-000000000001",
          personId: "30000000-0000-4000-8000-000000000001",
          name: "Synthetic Public Person",
          nameSearch: "synthetic public person",
          kind: "preferred",
          isPreferred: true
        },
        {
          id: "50000000-0000-4000-8000-000000000002",
          personId: "30000000-0000-4000-8000-000000000001",
          name: "Nguyen Trung Lap",
          nameSearch: "nguyen trung lap",
          kind: "alias",
          isPreferred: false
        },
        {
          id: "50000000-0000-4000-8000-000000000003",
          personId: "30000000-0000-4000-8000-000000000001",
          name: "Nguyen Trung Lap",
          nameSearch: "nguyen trung lap",
          kind: "alias",
          isPreferred: false
        }
      ]
    });

    expect(parsed.names).toHaveLength(3);
    expect(parsed.id).toBe("30000000-0000-4000-8000-000000000001");
  });

  it("does not accept client-supplied actor identity in proposal input", () => {
    const parsed = proposalSubmitInputSchema.safeParse({
      treeId: "10000000-0000-4000-8000-000000000001",
      kind: "correction",
      reason: "Synthetic correction",
      items: [{
        targetKind: "person",
        operation: "update",
        targetId: "30000000-0000-4000-8000-000000000001",
        baseVersion: 1,
        fieldChanges: { display_name: "Synthetic Updated Person" },
        sourceIds: []
      }],
      actorId: "20000000-0000-4000-8000-000000000001"
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("actorId");
  });

  it("accepts a typed parent-link relationship proposal", () => {
    const parsed = proposalSubmitInputSchema.safeParse({
      treeId: "10000000-0000-4000-8000-000000000001",
      kind: "relationship",
      reason: "Synthetic relationship",
      items: [{
        targetKind: "parent_link",
        operation: "create",
        fieldChanges: {
          parent_id: "30000000-0000-4000-8000-000000000001",
          child_id: "30000000-0000-4000-8000-000000000002",
          kind: "biological",
          status: "confirmed",
          source_id: "40000000-0000-4000-8000-000000000001"
        },
        sourceIds: ["40000000-0000-4000-8000-000000000001"]
      }]
    });

    expect(parsed.success).toBe(true);
  });

  it("requires typed claim review input without granting authority in the payload", () => {
    expect(claimSubmitInputSchema.parse({
      treeId: "10000000-0000-4000-8000-000000000001",
      personId: "30000000-0000-4000-8000-000000000001",
      reason: "Synthetic account claim"
    }).personId).toBe("30000000-0000-4000-8000-000000000001");
    expect(claimReviewInputSchema.parse({
      claimId: "80000000-0000-4000-8000-000000000001",
      decision: "approve",
      reason: "Synthetic independent review",
      baseVersion: 1
    }).decision).toBe("approve");
  });

  it("accepts a soft-delete request and impact projection without erasure fields", () => {
    expect(personDeletionInputSchema.parse({
      treeId: "10000000-0000-4000-8000-000000000001",
      reason: "Synthetic soft-delete request"
    }).treeId).toBe("10000000-0000-4000-8000-000000000001");
    expect(personDeletionImpactSchema.parse({
      personId: "30000000-0000-4000-8000-000000000001",
      treeId: "10000000-0000-4000-8000-000000000001",
      version: 1,
      edgeCount: 2,
      factCount: 1,
      sourceCount: 1,
      edgeIds: ["50000000-0000-4000-8000-000000000001"],
      factIds: ["60000000-0000-4000-8000-000000000001"],
      sourceIds: ["40000000-0000-4000-8000-000000000001"]
    }).sourceCount).toBe(1);
  });
});
