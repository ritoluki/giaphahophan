import type { RichTextDocument } from "@phan/contracts";

const coverAssetId = "81000000-0000-4000-8000-000000000001";

export type DemoNewsPost = {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly publishedLabel: string;
  readonly readingTime: string;
  readonly demoOnly: true;
  readonly body: RichTextDocument;
  readonly media: Readonly<Record<string, { readonly src: string; readonly width: number; readonly height: number }>>;
};

const posts: readonly DemoNewsPost[] = [
  {
    slug: "giu-gin-nguon-coi",
    title: "Chuyện gia đình có nguồn",
    summary: "Gìn giữ câu chuyện của gia đình bằng lời kể, ảnh cũ và tư liệu được đối chiếu cẩn thận.",
    category: "Câu chuyện",
    publishedLabel: "Bài mẫu giao diện",
    readingTime: "3 phút đọc",
    demoOnly: true,
    body: {
      version: 1,
      blocks: [
        { type: "heading", level: 2, children: [{ type: "text", text: "Từ những ký ức gia đình" }] },
        { type: "paragraph", children: [{ type: "text", text: "Đây là nội dung minh họa cho Phan Gia Phả, không phải tư liệu lịch sử hay dữ liệu gia đình thật. Mỗi bài viết thật sẽ đi cùng nguồn, trạng thái duyệt và người chịu trách nhiệm." }] },
        { type: "image", assetId: coverAssetId, alt: "Nền hoa văn Việt Nam minh họa cho bài viết", caption: "Hình minh họa giao diện, không phải ảnh tư liệu gia đình" },
        { type: "paragraph", children: [{ type: "text", text: "Một câu chuyện thường được nhớ lại qua nhiều người và nhiều thế hệ. Ghi rõ người kể, thời điểm và tư liệu liên quan giúp con cháu hiểu thông tin đến từ đâu, đồng thời biết phần nào còn cần tìm hiểu thêm." }] },
        { type: "quote", children: [{ type: "emphasis", text: "Có nguồn, có người gìn giữ, có giới hạn hiển thị." }] },
        {
          type: "list",
          ordered: false,
          items: [
            { type: "list_item", children: [{ type: "strong", text: "Rõ nguồn" }, { type: "text", text: " — người đọc biết thông tin đến từ đâu." }] },
            { type: "list_item", children: [{ type: "strong", text: "Tôn trọng riêng tư" }, { type: "text", text: " — ảnh và thông tin riêng chỉ được chia sẻ khi có sự đồng ý phù hợp." }] },
            { type: "list_item", children: [{ type: "strong", text: "Cẩn thận khi bổ sung" }, { type: "text", text: " — thông tin mới cần được đối chiếu và duyệt trước khi thay đổi bài đã công bố." }] },
          ],
        },
      ],
    },
    media: {
      [coverAssetId]: { src: "/assets/section-background.png", width: 1600, height: 720 },
    },
  },
];

export function getDemoNewsPosts(): readonly DemoNewsPost[] {
  return posts;
}

export function getDemoNewsPost(slug: string): DemoNewsPost | null {
  return posts.find((post) => post.slug === slug) ?? null;
}
