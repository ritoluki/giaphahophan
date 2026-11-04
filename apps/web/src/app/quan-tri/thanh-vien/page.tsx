import { AdminShell } from "../../_components/site-chrome";
import { MembershipAdmin } from "./membership-admin";

export default function MembershipAdminPage() {
  return (
    <AdminShell>
      <main id="main-content" tabIndex={-1} className="container page admin-page">
        <h1>Thành viên và quyền</h1>
        <p className="page-lede">Quản lý thành viên, phân công người biên soạn và người duyệt. Thay đổi quyền cần xác thực hai bước.</p>
        <MembershipAdmin />
      </main>
    </AdminShell>
  );
}
