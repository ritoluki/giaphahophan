import Link from "next/link";
import { LogoutButton } from "../_components/logout-button";
import { SiteShell } from "../_components/site-chrome";
import { createRequestSupabaseClient, getVerifiedUser } from "../../lib/server/supabase-api";

export const dynamic = "force-dynamic";

const menuItems = [
  { href: "/tin-ho", title: "Tin họ", description: "Những câu chuyện và thông tin chung của dòng họ." },
  { href: "/dia-diem", title: "Nhà thờ và địa điểm", description: "Nơi thờ tự, khu mộ và những nơi gắn với gia đình." },
  { href: "/quy-ho", title: "Quỹ họ", description: "Xem tình hình thu, chi và đối chiếu sổ quỹ." },
  { href: "/khuyen-hoc", title: "Khuyến học", description: "Chương trình học bổng và hỗ trợ học tập." },
  { href: "/gioi-thieu", title: "Về Phan Gia Phả", description: "Mục đích và cách gìn giữ thông tin gia đình." },
  { href: "/tu-lieu", title: "Thư viện tư liệu", description: "Ảnh, tài liệu và lời kể được chia sẻ với bạn." },
  { href: "/dong-gop/moi", title: "Đóng góp cho gia phả", description: "Gửi đề nghị sửa, bổ sung người hoặc quan hệ kèm nguồn tham chiếu." },
  { href: "/quan-tri", title: "Quản trị", description: "Dành cho người được giao quản lý gia phả." }
] as const;

export default async function MorePage() {
  let signedIn = false;
  let sessionAvailable = true;
  try {
    const client = await createRequestSupabaseClient();
    signedIn = Boolean(await getVerifiedUser(client));
  } catch {
    sessionAvailable = false;
  }
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page">
        <h1>Nội dung khác</h1>
        <section className="card account-session-card" aria-labelledby="session-heading">
          <h2 id="session-heading" tabIndex={-1}>Tài khoản của bạn</h2>
          {signedIn ? <><p>Bạn đã đăng nhập. Đăng xuất sẽ kết thúc phiên trên các thiết bị đang dùng tài khoản này.</p><div className="profile-actions"><LogoutButton /><Link className="button-secondary" href="/thiet-lap-mfa">Xác thực hai bước</Link></div></> : <>
            <p>{sessionAvailable ? "Đăng nhập bằng tài khoản đã được mời để sử dụng các chức năng dành cho thành viên." : "Chưa xác định được trạng thái đăng nhập. Hãy mở lại trang đăng nhập để tiếp tục."}</p>
            <div className="profile-actions"><Link className="button-primary" href="/dang-nhap">Đăng nhập</Link><Link className="button-secondary" href="/quen-mat-khau">Quên mật khẩu</Link></div>
          </>}
        </section>
        <nav className="more-menu" aria-label="Các mục khác">{menuItems.map((item) => <Link className="more-menu-item" href={item.href} key={item.href}><h2>{item.title}</h2><p>{item.description}</p></Link>)}</nav>
      </main>
    </SiteShell>
  );
}
