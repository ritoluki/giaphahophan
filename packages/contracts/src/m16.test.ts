import { describe, expect, it } from "vitest";
import { importCancelSchema, importCommitSchema, importInputSchema, importJobSchema, importMappingSchema, importPreviewSchema, importRelationshipMappingSchema, importRelationshipRowsPageSchema, importReviewInputSchema, importRowDecisionSchema, importRowsPageSchema, importRowsQuerySchema } from "./index";

describe("M16 import contracts", () => {
  it("requires a current version and meaningful reason for pre-apply cancellation", () => {
    expect(importCancelSchema.safeParse({ baseVersion: 3, reason: "Source owner withdrew permission" }).success).toBe(true);
    expect(importCancelSchema.safeParse({ baseVersion: 0, reason: "valid reason" }).success).toBe(false);
    expect(importCancelSchema.safeParse({ baseVersion: 3, reason: "no" }).success).toBe(false);
    expect(importCancelSchema.safeParse({ baseVersion: 3, reason: "valid reason", force: true }).success).toBe(false);
  });
  it("requires explicit mapping decisions and keeps family pages allowlisted and bounded", () => {
    const mapping = { baseVersion: 2, snapshotHash: "a".repeat(64), familyExternalId: "F1", partnerExternalIds: ["I1"],
      childExternalIds: ["I2"], parentLinks: [{ parentExternalId: "I1", childExternalId: "I2", kind: "biological", status: "disputed" }], reason: "Hư cấu: đối chiếu nguồn" };
    expect(importRelationshipMappingSchema.safeParse(mapping).success).toBe(true);
    expect(importRelationshipMappingSchema.safeParse({ ...mapping, parentLinks: [{ ...mapping.parentLinks[0], inferredFromUnion: true }] }).success).toBe(false);
    const family = { rowNumber: 4, familyExternalId: "F1", partners: [{ externalId: "I1", displayName: "Fictional A", status: "review", excluded: false, relationshipOnlyReview: true }],
      children: [], savedMapping: null };
    const page = { jobId: "a6100000-0000-4000-8000-000000000003", version: 2, families: [family], nextCursor: null };
    expect(importRelationshipRowsPageSchema.safeParse(page).success).toBe(true);
    expect(importRelationshipRowsPageSchema.safeParse({ ...page, families: Array.from({ length: 51 }, () => family) }).success).toBe(false);
    expect(importRelationshipRowsPageSchema.safeParse({ ...page, families: [{ ...family, rawPayload: { secret: "private" } }] }).success).toBe(false);
  });
  it("bounds row inspection cursors and rejects raw payloads in pages", () => {
    expect(importRowsQuerySchema.parse({ baseVersion: "2" }).after).toBe(0);
    expect(importRowsQuerySchema.safeParse({ baseVersion: 0, after: 0 }).success).toBe(false);
    expect(importRowsQuerySchema.safeParse({ baseVersion: 2, after: 10001 }).success).toBe(false);
    const row = { rowNumber: 51, externalId: "synthetic-51", displayName: "Hư cấu", status: "valid", excluded: false, errors: [] };
    const page = { jobId: "a6100000-0000-4000-8000-000000000003", version: 2, rows: [row], nextCursor: null };
    expect(importRowsPageSchema.safeParse(page).success).toBe(true);
    expect(importRowsPageSchema.safeParse({ ...page, rows: Array.from({ length: 51 }, () => row) }).success).toBe(false);
    expect(importRowsPageSchema.safeParse({ ...page, rows: [{ ...row, rawPayload: { secret: "private" } }] }).success).toBe(false);
  });
  it("requires a bounded row decision, source snapshot and nonblank reason", () => {
    const decision = { baseVersion: 2, snapshotHash: "a".repeat(64), rowNumber: 1, excluded: true, reason: "Hư cấu: thiếu bằng chứng" };
    expect(importRowDecisionSchema.safeParse(decision).success).toBe(true);
    expect(importRowDecisionSchema.safeParse({ ...decision, excluded: false }).success).toBe(true);
    for (const invalid of [{ reason: " " }, { rowNumber: 0 }, { rowNumber: 10001 }, { baseVersion: 0 }, { snapshotHash: "stale" }, { normalized: {} }]) {
      expect(importRowDecisionSchema.safeParse({ ...decision, ...invalid }).success).toBe(false);
    }
  });
  it("binds review and commit to versions and approved snapshots without partial writes", () => {
    const reviewed = { baseVersion: 2, snapshotHash: "a".repeat(64) };
    expect(importReviewInputSchema.safeParse(reviewed).success).toBe(true);
    expect(importReviewInputSchema.safeParse({ ...reviewed, baseVersion: 0 }).success).toBe(false);
    const commit = { baseVersion: 3, approvedSnapshotHash: reviewed.snapshotHash, approvalId: "a6100000-0000-4000-8000-000000000003", allowPartial: false };
    expect(importCommitSchema.safeParse(commit).success).toBe(true);
    expect(importCommitSchema.safeParse({ ...commit, allowPartial: true }).success).toBe(false);
    expect(importCommitSchema.safeParse({ ...commit, approvalId: null }).success).toBe(false);
    expect(importCommitSchema.safeParse({ ...commit, approvedSnapshotHash: "stale" }).success).toBe(false);
  });
  it("keeps intake source identity and staging preview typed", () => {
    expect(importInputSchema.parse({ treeId: "a6100000-0000-4000-8000-000000000001", assetId: "a6100000-0000-4000-8000-000000000002", format: "canonical_json", sourceNamespace: "legacy-demo", mappingVersion: "v1", mode: "demo" }).mode).toBe("demo");
    expect(importJobSchema.parse({ id: "a6100000-0000-4000-8000-000000000003", version: 1, kind: "import", status: "needs_review", counters: { processed: 2, succeeded: 1, failed: 1, skipped: 0 }, warnings: ["unknown date"], errorCode: null, expiresAt: null, treeId: "a6100000-0000-4000-8000-000000000001", sourceAssetId: "a6100000-0000-4000-8000-000000000002", fileSha256: "a".repeat(64), format: "canonical_json", sourceNamespace: "legacy-demo", mappingVersion: "v1", classification: "canonical" }).classification).toBe("canonical");
    expect(importPreviewSchema.safeParse({ jobId: "a6100000-0000-4000-8000-000000000003", version: 1, snapshotHash: "b".repeat(64), fileSha256: "c".repeat(64), classification: "canonical", valid: 1, invalid: 1, possibleDuplicates: 0, warnings: [], sampleRows: [] }).success).toBe(true);
    expect(importPreviewSchema.safeParse({ jobId: "a6100000-0000-4000-8000-000000000003", version: 1, snapshotHash: "b".repeat(64), fileSha256: "c".repeat(64), classification: "canonical", valid: 0, invalid: 0, possibleDuplicates: 0, warnings: [], sampleRows: [{ rowNumber: 1, externalId: "synthetic", displayName: "Fictional", status: "valid", errors: [], rawPayload: { secret: "must-not-leak" } }] }).success).toBe(false);
  });

  it("allows GEDCOM profiles without pretending the file is JSON or CSV", () => {
    expect(importInputSchema.parse({ treeId: "a6100000-0000-4000-8000-000000000001", assetId: "a6100000-0000-4000-8000-000000000002", format: "gedcom_551", sourceNamespace: "synthetic-v1", mappingVersion: "gedcom-subset/1", mode: "demo" }).format).toBe("gedcom_551");
  });

  it("requires versioned CSV mappings and matching mapping versions", () => {
    const mapping = { mappingVersion: "structured-csv/1", columns: { id: "externalId", name: "displayName" }, dateInterpretation: "explicit_only", sourceNamespace: "synthetic-v1" };
    expect(importMappingSchema.safeParse(mapping).success).toBe(true);
    const base = { treeId: "a6100000-0000-4000-8000-000000000001", assetId: "a6100000-0000-4000-8000-000000000002", format: "csv", sourceNamespace: "synthetic-v1", mappingVersion: "structured-csv/1", mode: "demo" };
    expect(importInputSchema.safeParse({ ...base, mapping }).success).toBe(true);
    expect(importInputSchema.safeParse(base).success).toBe(false);
    expect(importInputSchema.safeParse({ ...base, mapping: { ...mapping, mappingVersion: "structured-csv/2" } }).success).toBe(false);
  });
});
