import { SiteShell } from "../../_components/site-chrome";
import { ProposalForm } from "./proposal-form";

export default function NewProposalPage() {
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page proposal-page">
        <p className="eyebrow">Đóng góp cho gia phả</p>
        <h1>Gửi đề nghị bổ sung</h1>
        <p className="page-lede">Mỗi thay đổi sẽ được ghi nhận thành một đề nghị có nguồn. Dữ liệu chính thức chỉ thay đổi sau khi được người có quyền xem xét.</p>
        <ProposalForm />
      </main>
    </SiteShell>
  );
}
