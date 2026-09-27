import type { Metadata } from "next";
import { NewsIndex } from "../../modules/m12/news-reader";
import { getDemoNewsPosts } from "../../modules/m12/demo-content";

const indexable = process.env.APP_ENV === "production" && process.env.DATA_MODE === "real";

export const metadata: Metadata = {
  title: "Tin họ · Phan Gia Phả",
  description: "Những câu chuyện và tư liệu đã được xác minh, duyệt và cho phép hiển thị công khai.",
  alternates: { canonical: "/tin-ho" },
  robots: indexable ? { index: true, follow: true } : { index: false, follow: false, noarchive: true },
  openGraph: {
    title: "Tin họ · Phan Gia Phả",
    description: "Nội dung công khai đã được xác minh và duyệt.",
    type: "website",
  },
};

export default function NewsPage() {
  return <NewsIndex posts={getDemoNewsPosts()} />;
}
