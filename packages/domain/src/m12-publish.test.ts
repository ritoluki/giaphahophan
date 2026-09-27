import { describe, expect, it } from "vitest";
import type { RichTextDocument } from "@phan/contracts";
import {
  applyContentRevisionTransition,
  deriveContentLifecycleStatus,
  isPreviewGrantUsable,
  issuePreviewGrant,
  type ContentPageRecord,
  type ContentRevisionRecord,
} from "./m12-publish";

const body: RichTextDocument = { version: 1, blocks: [{ type: "paragraph", children: [{ type: "text", text: "Bản nháp" }] }] };
const author = "88000000-0000-4000-8000-000000000001";
const reviewer = "88000000-0000-4000-8000-000000000002";
const revisionId = "8a000000-0000-4000-8000-000000000001";
const page: ContentPageRecord = { id: "89000000-0000-4000-8000-000000000001", version: 1, publishedRevisionId: null };

function revision(overrides: Partial<ContentRevisionRecord> = {}): ContentRevisionRecord {
  return {
    id: revisionId,
    pageId: page.id,
    version: 1,
    status: "draft",
    createdBy: author,
    approvedBy: null,
    title: "Bài viết demo",
    body,
    publishAt: null,
    ...overrides,
  };
}

describe("M12-02 revision/publish workflow", () => {
  it("keeps draft separate, requires a separate reviewer and publishes a snapshot", () => {
    const submitted = applyContentRevisionTransition(revision(), page, {
      action: "submit",
      actorId: author,
      expectedRevisionVersion: 1,
      expectedPageVersion: null,
      publishAt: null,
    }, "2026-09-28T03:00:00Z");
    const approved = applyContentRevisionTransition(submitted.revision, submitted.page, {
      action: "approve",
      actorId: reviewer,
      expectedRevisionVersion: 2,
      expectedPageVersion: null,
      publishAt: null,
    }, "2026-09-28T03:01:00Z");
    const published = applyContentRevisionTransition(approved.revision, approved.page, {
      action: "publish",
      actorId: reviewer,
      expectedRevisionVersion: 3,
      expectedPageVersion: 1,
      publishAt: null,
    }, "2026-09-28T03:02:00Z");

    expect(published.revision.status).toBe("published");
    expect(published.page.publishedRevisionId).toBe(revisionId);
    expect(published.page.version).toBe(2);
    expect(deriveContentLifecycleStatus(approved.revision, "2026-09-28T03:02:00Z")).toBe("approved");
  });

  it("keeps future publish scheduled without changing the public pointer", () => {
    const approved = revision({ status: "approved", version: 3, approvedBy: reviewer });
    const result = applyContentRevisionTransition(approved, page, {
      action: "publish",
      actorId: reviewer,
      expectedRevisionVersion: 3,
      expectedPageVersion: 1,
      publishAt: "2026-09-29T03:00:00Z",
    }, "2026-09-28T03:00:00Z");

    expect(result.lifecycleStatus).toBe("scheduled");
    expect(result.revision.status).toBe("approved");
    expect(result.page.publishedRevisionId).toBeNull();
  });

  it("rejects self-approval, stale versions and archive before publish", () => {
    expect(() => applyContentRevisionTransition(revision(), page, {
      action: "approve",
      actorId: author,
      expectedRevisionVersion: 1,
      expectedPageVersion: null,
      publishAt: null,
    }, "2026-09-28T03:00:00Z")).toThrow("content_approval_invalid");

    expect(() => applyContentRevisionTransition(revision(), page, {
      action: "submit",
      actorId: author,
      expectedRevisionVersion: 2,
      expectedPageVersion: null,
      publishAt: null,
    }, "2026-09-28T03:00:00Z")).toThrow("content_revision_version_conflict");

    expect(() => applyContentRevisionTransition(revision(), page, {
      action: "archive",
      actorId: author,
      expectedRevisionVersion: 1,
      expectedPageVersion: null,
      publishAt: null,
    }, "2026-09-28T03:00:00Z")).toThrow("content_archive_invalid");
  });

  it("issues no-index preview grants with deterministic expiry", () => {
    const grant = issuePreviewGrant({
      pageId: page.id,
      revisionId,
      now: "2026-09-28T03:00:00Z",
      ttlSeconds: 900,
      tokenFactory: () => "p".repeat(64),
    });

    expect(grant.noIndex).toBe(true);
    expect(grant.expiresAt).toBe("2026-09-28T03:15:00.000Z");
    expect(isPreviewGrantUsable(grant, { token: grant.token, pageId: page.id, revisionId }, "2026-09-28T03:14:59Z")).toBe(true);
    expect(isPreviewGrantUsable(grant, { token: grant.token, pageId: page.id, revisionId }, "2026-09-28T03:15:00Z")).toBe(false);
  });
});
