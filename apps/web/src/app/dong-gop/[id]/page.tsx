import { SiteShell } from "../../_components/site-chrome";
import { ProposalDetail } from "./proposal-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProposalDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page proposal-page">
        <h1>Theo dõi đề nghị</h1>
        <p className="page-lede">Xem nội dung đã gửi, trạng thái xử lý và ý kiến của người duyệt.</p>
        <ProposalDetail id={id} />
      </main>
    </SiteShell>
  );
}
