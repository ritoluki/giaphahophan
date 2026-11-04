import Link from "next/link";
import { AdminShell } from "../_components/site-chrome";

const workspaces = [
  { href: "/quan-tri/thanh-vien", title: "Thành viên và quyền", detail: "Xem thành viên, thay đổi vai trò và cấp quyền cho người phụ trách.", action: "Quản lý thành viên" },
  { href: "/quan-tri/nhap-lieu", title: "Nhập gia phả từ tệp", detail: "Tải tệp, kiểm tra từng dòng và đối chiếu quan hệ trước khi đề nghị áp dụng.", action: "Mở phần nhập liệu" },
  { href: "/quan-tri/xuat-lieu", title: "Xuất gia phả", detail: "Chọn phạm vi, tạo yêu cầu và tải bản gia phả được phép xuất.", action: "Mở phần xuất gia phả" },
  { href: "/quan-tri/khuyen-hoc", title: "Báo cáo khuyến học", detail: "Xem các khoản khuyến học trong phạm vi tài khoản được cấp quyền.", action: "Xem báo cáo" },
] as const;

export default function AdminPage() {
  return (
    <AdminShell>
      <main id="main-content" tabIndex={-1} className="container page admin-page">
        <h1>Quản lý gia phả</h1>
        <p className="page-lede">Chọn công việc cần làm. Mỗi khu vực chỉ mở thông tin và thao tác phù hợp với quyền của tài khoản.</p>
        <section className="admin-grid" aria-label="Công việc quản lý gia phả">
          {workspaces.map((workspace) => <article className="card admin-card" key={workspace.href}><h2>{workspace.title}</h2><p>{workspace.detail}</p><Link className="button-secondary" href={workspace.href}>{workspace.action}</Link></article>)}
        </section>
        <section className="card admin-principles"><h2>Trước khi thay đổi dữ liệu</h2><ul><li>Kiểm tra đúng người và căn cứ nguồn; người trùng tên có thể là hai người khác nhau.</li><li>Đề nghị cần được một người khác xem xét trước khi áp dụng.</li><li>Các công việc cần quyền quản lý yêu cầu xác thực hai bước.</li></ul></section>
      </main>
    </AdminShell>
  );
}
