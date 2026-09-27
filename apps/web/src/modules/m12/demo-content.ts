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
    title: "Gìn giữ nguồn cội bằng những câu chuyện có nguồn",
    summary: "Bài mẫu minh họa cách một câu chuyện được trình bày rõ nguồn, giữ riêng tư và đọc tốt trên điện thoại.",
    category: "Câu chuyện",
    publishedLabel: "Bài mẫu giao diện",
    readingTime: "3 phút đọc",
    demoOnly: true,
    body: {
      version: 1,
      blocks: [
        { type: "heading", level: 2, children: [{ type: "text", text: "Một bài viết bắt đầu từ sự cẩn trọng" }] },
        { type: "paragraph", children: [{ type: "text", text: "Đây là nội dung minh họa cho Phan Gia Phả, không phải tư liệu lịch sử hay dữ liệu gia đình thật. Mỗi bài viết thật sẽ đi cùng nguồn, trạng thái duyệt và người chịu trách nhiệm." }] },
        { type: "image", assetId: coverAssetId, alt: "Nền hoa văn Việt Nam minh họa cho bài viết", caption: "Asset thiết kế được duyệt · Không phải ảnh tư liệu gia đình" },
        { type: "paragraph", children: [{ type: "text", text: "Khi nội dung được xuất bản, bản đã duyệt trở thành một snapshot riêng. Bản nháp tiếp theo có thể thay đổi mà không làm nội dung công khai đổi theo trước khi được kiểm tra." }] },
        { type: "quote", children: [{ type: "emphasis", text: "Có nguồn, có người gìn giữ, có giới hạn hiển thị." }] },
        {
          type: "list",
          ordered: false,
          items: [
            { type: "list_item", children: [{ type: "strong", text: "Rõ nguồn" }, { type: "text", text: " — người đọc biết thông tin đến từ đâu." }] },
            { type: "list_item", children: [{ type: "strong", text: "Đúng quyền" }, { type: "text", text: " — ảnh và tên riêng không tự xuất hiện trong metadata công khai." }] },
            { type: "list_item", children: [{ type: "strong", text: "Đúng bản" }, { type: "text", text: " — published snapshot không bị draft ghi đè." }] },
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
