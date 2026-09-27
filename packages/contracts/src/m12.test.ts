import { describe, expect, it } from "vitest";
import {
  contentRevisionInputSchema,
  richTextDocumentSchema,
} from "./index";

const assetId = "81000000-0000-4000-8000-000000000001";

describe("M12-01 rich text contracts", () => {
  it("accepts only the versioned allowlist shape", () => {
    const parsed = richTextDocumentSchema.parse({
      version: 1,
      blocks: [
        {
          type: "heading",
          level: 2,
          children: [{ type: "strong", text: "Lịch sử dòng họ" }],
        },
        {
          type: "paragraph",
          children: [
            { type: "text", text: "Đọc " },
            { type: "link", href: "/tin-ho/lich-su", label: "bài viết" },
          ],
        },
        { type: "image", assetId, alt: "Ảnh tư liệu đã được cấp quyền" },
      ],
    });

    expect(parsed.blocks).toHaveLength(3);
  });

  it("rejects unsafe links, unknown nodes, extra attributes and invalid media ids", () => {
    expect(() => richTextDocumentSchema.parse({
      version: 1,
      blocks: [{ type: "paragraph", children: [{ type: "link", href: "javascript:alert(1)", label: "x" }] }],
    })).toThrow();

    expect(() => richTextDocumentSchema.parse({
      version: 1,
      blocks: [{ type: "script", children: [] }],
    })).toThrow();

    expect(() => richTextDocumentSchema.parse({
      version: 1,
      blocks: [{ type: "image", assetId, alt: "x", src: "https://evil.example/x" }],
    })).toThrow();

    expect(() => contentRevisionInputSchema.parse({
      pageId: "82000000-0000-4000-8000-000000000001",
      title: "  Bài viết  ",
      body: { version: 1, blocks: [] },
      unexpected: true,
    })).toThrow();
  });
});
