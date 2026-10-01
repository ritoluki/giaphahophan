import { describe, expect, it } from "vitest";
import { importInputSchema, importJobSchema, importPreviewSchema } from "./index";

describe("M16 import contracts", () => {
  it("keeps intake source identity and staging preview typed", () => {
    expect(importInputSchema.parse({ treeId: "a6100000-0000-4000-8000-000000000001", assetId: "a6100000-0000-4000-8000-000000000002", format: "canonical_json", sourceNamespace: "legacy-demo", mappingVersion: "v1", mode: "demo" }).mode).toBe("demo");
    expect(importJobSchema.parse({ id: "a6100000-0000-4000-8000-000000000003", version: 1, kind: "import", status: "needs_review", counters: { processed: 2, succeeded: 1, failed: 1, skipped: 0 }, warnings: ["unknown date"], errorCode: null, expiresAt: null, treeId: "a6100000-0000-4000-8000-000000000001", sourceAssetId: "a6100000-0000-4000-8000-000000000002", fileSha256: "a".repeat(64), format: "canonical_json", sourceNamespace: "legacy-demo", mappingVersion: "v1", classification: "canonical" }).classification).toBe("canonical");
    expect(importPreviewSchema.safeParse({ jobId: "a6100000-0000-4000-8000-000000000003", version: 1, snapshotHash: "b".repeat(64), fileSha256: "c".repeat(64), classification: "canonical", valid: 1, invalid: 1, possibleDuplicates: 0, warnings: [], sampleRows: [] }).success).toBe(true);
    expect(importPreviewSchema.safeParse({ jobId: "a6100000-0000-4000-8000-000000000003", version: 1, snapshotHash: "b".repeat(64), fileSha256: "c".repeat(64), classification: "canonical", valid: 0, invalid: 0, possibleDuplicates: 0, warnings: [], sampleRows: [{ rowNumber: 1, externalId: "synthetic", displayName: "Fictional", status: "valid", errors: [], rawPayload: { secret: "must-not-leak" } }] }).success).toBe(false);
  });
});
