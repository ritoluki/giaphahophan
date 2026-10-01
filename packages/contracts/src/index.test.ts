import { describe, expect, it } from "vitest";
import { authRecoveryInputSchema, authRecoveryResultSchema, claimReviewInputSchema, claimSubmitInputSchema, commandResultSchema, grantInputSchema, memberInputSchema, membershipGrantSchema, membershipSchema, mfaChallengeResultSchema, mfaEnrollResultSchema, mfaFactorInputSchema, mfaInputSchema, mfaStatusSchema, graphProjectionSchema, invitationAcceptInputSchema, invitationInputSchema, invitationMutationResultSchema, graphQuerySchema, mediaAssetSchema, mediaUploadInputSchema, mediaUploadIntentSchema, mediaDownloadSchema, passwordUpdateInputSchema, passwordUpdateResultSchema, personDeletionImpactSchema, personDeletionInputSchema, personIdentityProjectionSchema, personProjectionSchema, proposalSubmitInputSchema, personSearchQuerySchema, personSearchResultSchema, citationInputSchema, sourceInputSchema, mediaLinkInputSchema } from "./index";

describe("CORE-01 contracts", () => {
  it("requires source provenance and exactly one citation target", () => {
    const source = sourceInputSchema.parse({
      title: "Synthetic family register",
      kind: "book",
      providerName: "Synthetic archive",
      recordedDate: { calendar: "gregorian", precision: "exact", year: 2026, month: 9, day: 27, originalText: "2026-09-27" },
      provenance: "Synthetic fixture; not real family data",
      visibility: "restricted",
      rightsNote: null,
      originalAssetId: null
    });
    expect(source.kind).toBe("book");

    expect(citationInputSchema.parse({
      sourceId: "40000000-0000-4000-8000-000000000001",
      personId: "30000000-0000-4000-8000-000000000001",
      locator: "page 12, line 3",
      quotedText: null,
      confidence: "supported"
    }).personId).toBe("30000000-0000-4000-8000-000000000001");
    expect(() => citationInputSchema.parse({
      sourceId: "40000000-0000-4000-8000-000000000001",
      locator: "page 12"
    })).toThrow();
    expect(() => citationInputSchema.parse({
      sourceId: "40000000-0000-4000-8000-000000000001",
      personId: "30000000-0000-4000-8000-000000000001",
      factId: "60000000-0000-4000-8000-000000000001",
      locator: "page 12"
    })).toThrow();
  });
  it("keeps media upload intents typed, bounded and free of storage paths", () => {
    const input = mediaUploadInputSchema.parse({
      treeId: "10000000-0000-4000-8000-000000000001",
      filename: "synthetic.png",
      mimeType: "image/png",
      sizeBytes: 8,
      sha256: "a".repeat(64),
      purpose: "album",
      visibility: "restricted"
    });
    expect(input.treeId).toBe("10000000-0000-4000-8000-000000000001");
    expect(mediaAssetSchema.parse({
      id: "80000000-0000-4000-8000-000000000001",
      version: 1,
      state: "ready",
      mimeType: "image/png",
      sizeBytes: 8,
      visibility: "restricted",
      altText: null
    }).state).toBe("ready");
    expect(mediaUploadIntentSchema.parse({
      assetId: "80000000-0000-4000-8000-000000000001",
      uploadUrl: "https://app.example.test/api/v1/media/80000000-0000-4000-8000-000000000001/upload",
      expiresAt: "2026-09-27T12:00:00.000Z",
      requiredHeaders: { "Content-Type": "image/png" }
    })).not.toHaveProperty("objectPath");
    expect(mediaDownloadSchema.parse({ url: "https://signed.example.test/path", expiresAt: "2026-09-27T12:00:00.000Z", mode: "signed" }).mode).toBe("signed");
    expect(() => mediaUploadInputSchema.parse({ ...input, sha256: "not-a-hash" })).toThrow();
    expect(mediaUploadInputSchema.parse({ ...input, filename: "demo.json", mimeType: "application/json", purpose: "import" }).mimeType).toBe("application/json");
    expect(() => mediaUploadInputSchema.parse({ ...input, mimeType: "application/json", purpose: "album" })).toThrow();
  });

  it("keeps recovery and password update payloads bounded and secret-free", () => {
    expect(authRecoveryInputSchema.parse({ email: "demo@example.test" })).toEqual({ email: "demo@example.test" });
    expect(authRecoveryResultSchema.parse({ accepted: true })).toEqual({ accepted: true });
    expect(passwordUpdateInputSchema.parse({ password: "demo-password-123" })).toEqual({ password: "demo-password-123" });
    expect(passwordUpdateResultSchema.parse({ updated: true })).toEqual({ updated: true });
    expect(() => authRecoveryInputSchema.parse({ email: "demo@example.test", password: "secret" })).toThrow();
    expect(() => passwordUpdateInputSchema.parse({ password: "short", email: "demo@example.test" })).toThrow();
  });
  it("preserves canonical display and aliases in person search results", () => {
    expect(personSearchQuerySchema.parse({ q: "phan do", limit: "8" })).toEqual({ q: "phan do", sort: "name", limit: 8 });
    const result = personSearchResultSchema.parse({
      id: "30000000-0000-4000-8000-000000000001",
      version: 1,
      code: "M06-P001",
      displayName: "Phan Đức An",
      lifeStatus: "deceased",
      primaryBranchId: null,
      isDemo: true,
      matchedNames: [{ name: "Phan Đỗ", kind: "alias" }]
    });
    expect(result.displayName).toBe("Phan Đức An");
    expect(result.matchedNames[0]?.name).toBe("Phan Đỗ");
    expect(() => personSearchResultSchema.parse({ ...result, sourceTitle: "Hidden source" })).toThrow();
    expect(() => personSearchResultSchema.parse({ ...result, matchedNames: [{ name: "Phan Đỗ", kind: "alias", sourceId: "hidden" }] })).toThrow();
  });
  it("requires media links to keep exactly one real target", () => {
    expect(mediaLinkInputSchema.parse({
      contentRevisionId: "70000000-0000-4000-8000-000000000001",
      caption: "Synthetic public article image"
    }).contentRevisionId).toBe("70000000-0000-4000-8000-000000000001");
    expect(() => mediaLinkInputSchema.parse({ caption: "missing target" })).toThrow();
    expect(() => mediaLinkInputSchema.parse({
      personId: "30000000-0000-4000-8000-000000000001",
      sourceId: "40000000-0000-4000-8000-000000000001"
    })).toThrow();
  });  it("accepts the allowlisted person projection shape", () => {
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
  it("keeps invitation contracts strict and free of raw response secrets", () => {
    const input = invitationInputSchema.parse({
      treeId: "10000000-0000-4000-8000-000000000001",
      email: "member@synthetic.test",
      role: "member"
    });
    expect(input.email).toBe("member@synthetic.test");
    expect(invitationAcceptInputSchema.parse({ token: "a".repeat(32) }).token).toHaveLength(32);
    expect(invitationMutationResultSchema.parse({
      id: "80000000-0000-4000-8000-000000000001",
      treeId: "10000000-0000-4000-8000-000000000001",
      status: "pending",
      version: 1
    })).not.toHaveProperty("token");
    expect(() => invitationInputSchema.parse({
      treeId: input.treeId,
      email: input.email,
      role: input.role,
      token: "raw-secret"
    })).toThrow();
  });
  it("keeps MFA input strict and response secrets scoped to explicit enrollment", () => {
    expect(mfaInputSchema.parse({
      factorId: "80000000-0000-4000-8000-000000000001",
      challengeId: "80000000-0000-4000-8000-000000000002",
      code: "123456"
    }).code).toBe("123456");
    expect(mfaFactorInputSchema.parse({ factorId: "80000000-0000-4000-8000-000000000001" }).factorId).toBeTruthy();
    expect(mfaChallengeResultSchema.parse({ challengeId: "80000000-0000-4000-8000-000000000002", expiresAt: 2_000_000_000 }).expiresAt).toBe(2_000_000_000);
    expect(mfaEnrollResultSchema.parse({ factorId: "80000000-0000-4000-8000-000000000001", qrCode: "svg", secret: "secret", uri: "otpauth://totp/demo" }).secret).toBe("secret");
    expect(mfaStatusSchema.parse({ authenticated: true, aal: "aal2", mfaEnrolled: true, factorId: "80000000-0000-4000-8000-000000000001" }).aal).toBe("aal2");
    expect(() => mfaInputSchema.parse({ factorId: "80000000-0000-4000-8000-000000000001", challengeId: "80000000-0000-4000-8000-000000000002", code: "123456", secret: "leak" })).toThrow();
  });
  it("keeps membership mutations strict and prevents owner self-promotion inputs", () => {
    expect(memberInputSchema.parse({ role: "reviewer", status: "suspended", reason: "Synthetic suspension" }).status).toBe("suspended");
    expect(grantInputSchema.parse({ capability: "operations.read", branchId: null, expiresAt: null }).capability).toBe("operations.read");
    expect(membershipGrantSchema.parse({
      id: "80000000-0000-4000-8000-000000000001",
      version: 1,
      capability: "operations.read",
      branchId: null,
      expiresAt: null,
      revokedAt: null
    }).version).toBe(1);
    expect(membershipSchema.parse({
      id: "80000000-0000-4000-8000-000000000001",
      version: 1,
      displayName: "Synthetic member",
      role: "owner",
      status: "active",
      personId: null,
      mfaEnrolled: true,
      grants: []
    }).role).toBe("owner");
    expect(commandResultSchema.parse({
      id: "80000000-0000-4000-8000-000000000001",
      version: 1,
      status: "active"
    }).status).toBe("active");
    expect(() => memberInputSchema.parse({ role: "owner", status: "active", reason: "Self promote" })).toThrow();
    expect(() => grantInputSchema.parse({ capability: "operations.read", branchId: null, expiresAt: null, secret: "nope" })).toThrow();
  });
  it("keeps graph modes bounded and preserves disputed relationship labels", () => {
    expect(graphQuerySchema.parse({ direction: "roots", depth: "2", maxNodes: "120" })).toEqual({ direction: "roots", depth: 2, maxNodes: 120 });
    const parsed = graphProjectionSchema.parse({
      nodes: [{ occurrenceId: "root/demo", depth: 0, generation: 0, person: {
        id: "30000000-0000-4000-8000-000000000001", version: 1, code: "ROOT", displayName: "Synthetic Root", lifeStatus: "deceased", primaryBranchId: null, isDemo: true
      }}],
      edges: [{ id: "edge-1", sourceOccurrenceId: "root/demo", targetOccurrenceId: "child/demo", kind: "adoptive", status: "disputed" }],
      roots: ["root/demo"], graphRevision: 1, truncated: false, reason: null, expandablePersonIds: []
    });
    expect(parsed.edges[0]?.status).toBe("disputed");
  });
});
