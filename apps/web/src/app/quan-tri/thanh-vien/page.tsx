import { AdminShell } from "../../_components/site-chrome";
import { MembershipAdmin } from "./membership-admin";

export default function MembershipAdminPage() {
  return (
    <AdminShell>
      <main id="main-content" tabIndex={-1} className="container page admin-page">
        <p className="eyebrow">Quản trị · Membership</p>
        <h1>Thành viên và quyền</h1>
        <p className="page-lede">Quản lý trạng thái, vai trò và grant theo chi. Mọi thay đổi cần phiên quản trị đã xác nhận MFA.</p>
        <MembershipAdmin />
      </main>
    </AdminShell>
  );
}
