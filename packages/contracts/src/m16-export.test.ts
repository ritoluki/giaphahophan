import { describe, expect, it } from "vitest";
import { exportJobSchema, exportRequestSchema } from "./index";
const treeId = "a6700000-0000-4000-8000-000000000001";
describe("M16-06 export contracts", () => {
  it("keeps approved external format names and explicit audience/media/scope", () => {
    for (const format of ["canonical_json", "csv", "gedcom_551", "gedcom_7", "book_pdf", "svg"]) {
      expect(exportRequestSchema.safeParse({ treeId, format, reason: "Synthetic bulk", scope: { kind: "tree" }, audience: "members", includeMedia: false }).success).toBe(true);
    }
    expect(exportRequestSchema.safeParse({ treeId, format: "json", reason: "Synthetic bulk", scope: { kind: "tree" }, audience: "members", includeMedia: false }).success).toBe(false);
  });
  it("does not widen self audience into an entire tree", () => {
    const input = { treeId, format: "canonical_json", reason: "Synthetic personal", scope: { kind: "personal", personId: treeId }, audience: "self", includeMedia: false };
    expect(exportRequestSchema.safeParse(input).success).toBe(true);
    expect(exportRequestSchema.safeParse({ ...input, scope: { kind: "tree" } }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ ...input, audience: "members" }).success).toBe(false);
  });
  it("excludes artifact paths, requester IDs and private purpose from job DTOs", () => {
    const job = { id: treeId, treeId, version: 1, format: "book_pdf", scope: { kind: "tree" }, audience: "public", includeMedia: true,
      policyVersion: 1, status: "queued", expiresAt: "2026-01-01T00:00:00Z", warnings: [] };
    expect(exportJobSchema.parse(job)).toEqual(job);
    expect(exportJobSchema.safeParse({ ...job, objectPath: "private/export" }).success).toBe(false);
  });
});
