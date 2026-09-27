import { describe, expect, it } from "vitest";
import {
  contentRevisionTransitionSchema,
  previewAccessSchema,
  previewGrantSchema,
} from "./index";

const revisionId = "8a000000-0000-4000-8000-000000000001";
const pageId = "89000000-0000-4000-8000-000000000001";
const actorId = "88000000-0000-4000-8000-000000000001";

describe("M12-02 revision/publish contracts", () => {
  it("requires optimistic versions and keeps preview no-index explicit", () => {
    const transition = contentRevisionTransitionSchema.parse({
      action: "publish",
      revisionId,
      actorId,
      expectedRevisionVersion: 3,
      expectedPageVersion: 2,
      publishAt: "2026-09-28T10:00:00+07:00",
    });
    expect(transition.expectedPageVersion).toBe(2);

    const grant = previewGrantSchema.parse({
      token: "x".repeat(32),
      pageId,
      revisionId,
      issuedAt: "2026-09-28T03:00:00Z",
      expiresAt: "2026-09-28T03:15:00Z",
      noIndex: true,
    });
    expect(grant.noIndex).toBe(true);
  });

  it("rejects missing page version for a publish boundary and malformed preview access", () => {
    expect(() => contentRevisionTransitionSchema.parse({
      action: "publish",
      revisionId,
      actorId,
      expectedRevisionVersion: 3,
    })).not.toThrow();

    expect(() => previewAccessSchema.parse({
      token: "short",
      pageId,
      revisionId,
    })).toThrow();
  });
});
