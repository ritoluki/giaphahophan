import { SiteShell } from "../../_components/site-chrome";
import { ProposalDetail } from "./proposal-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProposalDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page proposal-page">
        <p className="eyebrow">Đóng góp cho gia phả</p>
        <h1>Theo dõi đề nghị</h1>
        <p className="page-lede">Mã theo dõi và trạng thái được đọc từ projection đã kiểm tra quyền. Chỉ tác giả hoặc người duyệt được xem nội dung chi tiết.</p>
        <ProposalDetail id={id} />
      </main>
    </SiteShell>
  );
}