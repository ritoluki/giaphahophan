import Link from "next/link";
import { LogoutButton } from "../_components/logout-button";
import { SiteShell } from "../_components/site-chrome";

const menuItems = [
  { href: "/gioi-thieu", title: "Giới thiệu", description: "Về mục tiêu và cách giữ nguồn có trách nhiệm." },
  { href: "/tu-lieu", title: "Thư viện tư liệu", description: "Nguồn, ảnh và tài liệu theo quyền truy cập." },
  { href: "/quan-tri", title: "Quản trị", description: "Chỉ dành cho tài khoản có capability phù hợp." },
  { href: "/dang-nhap", title: "Tài khoản", description: "Đăng nhập theo lời mời, phục hồi và bảo vệ phiên." }
] as const;

export default function MorePage() {
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page">
        <p className="eyebrow">Mục lục</p>
        <h1>Thêm</h1>
        <div className="cards">{menuItems.map((item) => <Link className="card" href={item.href} key={item.href}><h2>{item.title}</h2><p>{item.description}</p></Link>)}</div>
        <section className="card account-session-card" aria-labelledby="session-heading">
          <h2 id="session-heading">Phiên hiện tại</h2>
          <p>Đăng xuất sẽ kết thúc phiên trên các thiết bị đang dùng tài khoản này.</p>
          <LogoutButton />
        </section>
      </main>
    </SiteShell>
  );
}
