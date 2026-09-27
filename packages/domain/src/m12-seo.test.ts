import { describe, expect, it } from "vitest";
import {
  buildNoIndexContentSeo,
  buildPublicContentSeo,
  buildPublicSitemap,
  toPublicContentProjection,
} from "./m12-seo";

const revisionId = "8e000000-0000-4000-8000-000000000001";
const valid = {
  slug: "lich-su-demo",
  kind: "history" as const,
  title: "Lịch sử dòng họ",
  summary: "Bài viết đã được xác minh.",
  visibility: "public" as const,
  publishedRevisionId: revisionId,
  revisionId,
  revisionStatus: "published" as const,
  updatedAt: "2026-09-28T03:00:00Z",
  cover: { url: "https://cdn.example.test/public-cover.jpg", alt: "Ảnh tư liệu công khai" },
};

describe("M12-03 public SEO projection", () => {
  it("fails closed for non-public, draft or mismatched content", () => {
    expect(toPublicContentProjection({ ...valid, visibility: "members" })).toBeNull();
    expect(toPublicContentProjection({ ...valid, revisionStatus: "draft" })).toBeNull();
    expect(toPublicContentProjection({
      ...valid,
      revisionId: "8f000000-0000-4000-8000-000000000001",
    })).toBeNull();
  });

  it("builds metadata only from the approved public projection", () => {
    const projection = toPublicContentProjection(valid);
    expect(projection).not.toBeNull();
    const metadata = buildPublicContentSeo(projection!, "https://giaphap.example");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph.images).toEqual([{ url: valid.cover.url, alt: valid.cover.alt }]);
    expect(JSON.stringify(metadata)).not.toContain("private");
  });

  it("builds sitemap entries from public projections only", () => {
    const projection = toPublicContentProjection(valid);
    expect(buildPublicSitemap(projection ? [projection] : [], "https://giaphap.example")).toEqual([{
      url: "https://giaphap.example/tin-ho/lich-su-demo",
      lastModified: "2026-09-28T03:00:00Z",
    }]);
  });

  it("returns generic no-index metadata for preview or restricted paths", () => {
    const metadata = buildNoIndexContentSeo("https://giaphap.example", "/preview/opaque-token");
    expect(metadata.robots.index).toBe(false);
    expect(JSON.stringify(metadata)).not.toContain("opaque-token");
  });
});
