import Link from "next/link";
import { AdminShell } from "../_components/site-chrome";

const previewCards = [
  { title: "Hàng chờ duyệt", value: "Chưa kết nối", detail: "Đề nghị sẽ hiện tại đây sau khi có phiên và capability review." },
  { title: "Chất lượng dữ liệu", value: "Demo only", detail: "Duplicate, thiếu nguồn và xung đột quan hệ không được tự sửa." },
  { title: "Xuất bản", value: "Đang khóa", detail: "Cần review, privacy gate và approval manifest trước khi công bố." },
  { title: "Vận hành", value: "Degraded", detail: "Health ready chờ Supabase runtime; không ảnh hưởng dữ liệu demo." }
] as const;

export default function AdminPage() {
  return (
    <AdminShell>
      <main id="main-content" className="container page admin-page">
        <p className="eyebrow">Quản trị · Capability required</p>
        <h1>Tổng quan quản trị</h1>
        <p className="page-lede">Không có thao tác thay đổi dữ liệu trong bản preview. Mọi quyền thật sẽ được kiểm tra ở server/DB.</p>
        <div className="restricted-card admin-restricted"><strong>Truy cập bị giới hạn</strong><p>Phiên hiện tại chưa đăng nhập. Không hiển thị số liệu, tên người hoặc hàng chờ riêng tư.</p><Link className="button-primary" href="/dang-nhap">Đăng nhập theo lời mời</Link></div>
        <section className="admin-grid" aria-label="Các khu vực quản trị preview">
          {previewCards.map((card) => <article className="card admin-card" key={card.title}><span className="status-label">Preview</span><h2>{card.title}</h2><strong>{card.value}</strong><p>{card.detail}</p></article>)}
        </section>
        <section className="card admin-principles"><h2>Nguyên tắc an toàn</h2><ul><li>Ẩn nút không thay thế authorization ở server/DB.</li><li>Không tự nối người trùng tên hoặc tự duyệt đề nghị.</li><li>Export, merge và privacy action luôn cần capability riêng, audit và version check.</li></ul></section>
      </main>
    </AdminShell>
  );
}
