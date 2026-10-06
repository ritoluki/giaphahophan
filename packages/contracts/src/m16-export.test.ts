import { describe, expect, it } from "vitest";
import { exportCancelSchema, exportContextSchema, exportDraftFormSchema, exportDraftSchema, exportJobSchema, exportRequestSchema } from "./index";
const treeId = "a6700000-0000-4000-8000-000000000001";
describe("M16-06 export contracts", () => {
  it("validates authorized context without raw permission or private job extras", () => {
    const context = { actorId: treeId, csrfToken: "a".repeat(64), scopes: [{ treeId, treeName: "Synthetic Demo", label: "Authorized tree", scope: { kind: "tree" } }], jobs: [] };
    expect(exportContextSchema.safeParse(context).success).toBe(true);
    expect(exportContextSchema.safeParse({ ...context, permissions: ["service-role"] }).success).toBe(false);
    expect(exportContextSchema.safeParse({ ...context, csrfToken: "invalid" }).success).toBe(false);
    expect(exportContextSchema.safeParse({ ...context, scopes: Array.from({ length: 101 }, () => context.scopes[0]) }).success).toBe(false);
  });
  it("bounds and actor-binds private tab drafts without CSRF tokens", () => {
    const draft = { version: 1, actorId: treeId, treeId, scope: { kind: "tree" }, format: "canonical_json", audience: "members", includeMedia: false, reason: "x", savedAt: 1, request: null } as const;
    expect(exportDraftSchema.safeParse(draft).success).toBe(true);
    expect(exportDraftSchema.safeParse({ ...draft, csrfToken: "secret" }).success).toBe(false);
    expect(exportDraftSchema.safeParse({ ...draft, reason: "x".repeat(1001) }).success).toBe(false);
    expect(exportDraftFormSchema.safeParse({ format: draft.format, audience: draft.audience, includeMedia: draft.includeMedia, reason: draft.reason }).success).toBe(false);
  });
  it("requires a bounded cancellation version and reason without actor overrides", () => {
    expect(exportCancelSchema.parse({ baseVersion: 1, reason: "  Synthetic cancellation  " })).toEqual({ baseVersion: 1, reason: "Synthetic cancellation" });
    for (const input of [{ baseVersion: 0, reason: "Valid reason" }, { baseVersion: 1.5, reason: "Valid reason" }, { baseVersion: 1, reason: "no" }, { baseVersion: 1, reason: "Valid reason", actorId: treeId }]) {
      expect(exportCancelSchema.safeParse(input).success).toBe(false);
    }
  });
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
