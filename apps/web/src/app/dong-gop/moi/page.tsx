import { SiteShell } from "../../_components/site-chrome";
import { ProposalForm } from "./proposal-form";

export default function NewProposalPage() {
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page proposal-page">
        <h1>Gửi đề nghị bổ sung</h1>
        <p className="page-lede">Góp thêm thông tin hoặc đề nghị sửa gia phả. Người phụ trách sẽ đối chiếu nguồn và duyệt trước khi cập nhật.</p>
        <ProposalForm />
      </main>
    </SiteShell>
  );
}
