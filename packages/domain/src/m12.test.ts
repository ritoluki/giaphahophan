import { describe, expect, it } from "vitest";
import { sanitizeRichTextDocument } from "./m12";

const assetId = "81000000-0000-4000-8000-000000000001";

describe("M12-01 server rich text sanitizer", () => {
  it("drops unknown nodes and attributes while retaining an allowlisted document", () => {
    const result = sanitizeRichTextDocument({
      version: 1,
      blocks: [
        { type: "paragraph", children: [{ type: "text", text: "Nội dung an toàn" }], onclick: "alert(1)" },
        { type: "script", text: "alert(1)" },
        { type: "image", assetId, alt: "Bìa tư liệu", src: "javascript:alert(1)" },
      ],
    });

    expect(result.document.blocks).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "Nội dung an toàn" }] },
      { type: "image", assetId, alt: "Bìa tư liệu" },
    ]);
    expect(result.warnings).toContain("unsupported_block");
  });

  it("converts unsafe links to visible text instead of storing active content", () => {
    const result = sanitizeRichTextDocument({
      version: 1,
      blocks: [{
        type: "paragraph",
        children: [
          { type: "link", href: "javascript:alert(1)", label: "Xem tư liệu" },
          { type: "link", href: "/tin-ho/lich-su", label: "Nội bộ" },
          { type: "link", href: "https://example.com/source", label: "Nguồn ngoài" },
        ],
      }],
    });

    expect(result.document.blocks[0]).toEqual({
      type: "paragraph",
      children: [
        { type: "text", text: "Xem tư liệu" },
        { type: "link", href: "/tin-ho/lich-su", label: "Nội bộ" },
        { type: "link", href: "https://example.com/source", label: "Nguồn ngoài" },
      ],
    });
    expect(result.warnings).toContain("unsafe_link_removed");
  });

  it("rejects malformed roots and bounds oversized text", () => {
    expect(() => sanitizeRichTextDocument({ version: 2, blocks: [] })).toThrow("rich_text_document_invalid");

    const result = sanitizeRichTextDocument({
      version: 1,
      blocks: [{ type: "paragraph", children: [{ type: "text", text: "x".repeat(10_001) }] }],
    });
    expect(result.document.blocks).toEqual([{ type: "paragraph", children: [] }]);
    expect(result.warnings).toContain("text_limit_exceeded");
  });

  it("keeps media references opaque and never accepts a source URL", () => {
    const result = sanitizeRichTextDocument({
      version: 1,
      blocks: [{
        type: "image",
        assetId,
        alt: "Ảnh gia đình",
        src: "https://untrusted.example/image.jpg",
      }],
    });
    expect(result.document.blocks).toEqual([{ type: "image", assetId, alt: "Ảnh gia đình" }]);
  });
});
