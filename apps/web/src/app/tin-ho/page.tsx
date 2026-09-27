import type { Metadata } from "next";
import { FoundationPage } from "../_components/foundation-page";

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
  return <FoundationPage kicker="Tin họ · Nội dung đã duyệt" title="Tin tức và câu chuyện" description="Bản demo không bịa lịch sử hoặc tên địa phương. Nội dung xuất bản sẽ có nguồn, revision và người chịu trách nhiệm." />;
}
