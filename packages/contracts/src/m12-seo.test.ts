import { describe, expect, it } from "vitest";
import { publicContentSeoInputSchema } from "./index";

const revisionId = "8e000000-0000-4000-8000-000000000001";

describe("M12-03 public SEO contract", () => {
  it("accepts only a public published projection", () => {
    const value = publicContentSeoInputSchema.parse({
      slug: "lich-su-demo",
      kind: "history",
      title: "Lịch sử dòng họ",
      summary: "Bài viết đã được gia đình xác minh và xuất bản.",
      visibility: "public",
      publishedRevisionId: revisionId,
      revisionId,
      revisionStatus: "published",
      updatedAt: "2026-09-28T03:00:00Z",
      cover: null,
    });
    expect(value.visibility).toBe("public");
  });

  it("rejects private status, draft status and a mismatched published pointer", () => {
    const base = {
      slug: "bai-viet",
      kind: "news" as const,
      title: "Bài viết",
      summary: "Tóm tắt công khai.",
      visibility: "public" as const,
      publishedRevisionId: revisionId,
      revisionId,
      revisionStatus: "published" as const,
      updatedAt: "2026-09-28T03:00:00Z",
      cover: null,
    };

    expect(() => publicContentSeoInputSchema.parse({ ...base, visibility: "members" })).toThrow();
    expect(() => publicContentSeoInputSchema.parse({ ...base, revisionStatus: "draft" })).toThrow();
    expect(() => publicContentSeoInputSchema.parse({
      ...base,
      revisionId: "8f000000-0000-4000-8000-000000000001",
    })).toThrow();
  });
});
