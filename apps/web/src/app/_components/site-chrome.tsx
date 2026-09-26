import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export type NavKey = "home" | "tree" | "search" | "sources" | "calendar" | "more";

const primaryNav = [
  { href: "/gioi-thieu", label: "Giới thiệu" },
  { href: "/gia-pha", label: "Gia phả" },
  { href: "/lich-ho", label: "Lịch họ" },
  { href: "/tu-lieu", label: "Tư liệu" },
  { href: "/tin-ho", label: "Tin họ" }
] as const;

const bottomNav: Array<{ href: string; label: string; icon: string; key: NavKey }> = [
  { href: "/", label: "Trang chủ", icon: "⌂", key: "home" },
  { href: "/gia-pha", label: "Gia phả", icon: "⌘", key: "tree" },
  { href: "/tra-cuu", label: "Tra cứu", icon: "⌕", key: "search" },
  { href: "/lich-ho", label: "Lịch họ", icon: "♧", key: "calendar" },
  { href: "/them", label: "Thêm", icon: "⋯", key: "more" }
];

export function SiteHeader() {
  return (
    <header className="container topbar">
      <Link className="brand-lockup" href="/" aria-label="Phan Gia Phả - Trang chủ">
        <Image src="/assets/logo-mark.png" alt="" width={48} height={48} priority />
        <span>
          Phan Gia Phả
          <small>Kết nối cội nguồn · Gìn giữ dòng tộc</small>
        </span>
      </Link>
      <nav className="desktop-nav" aria-label="Điều hướng chính">
        {primaryNav.map((item) => (
          <Link href={item.href} key={item.href}>{item.label}</Link>
        ))}
      </nav>
      <Link className="button-secondary menu-button" href="/them" aria-label="Mở mục lục">☰</Link>
    </header>
  );
}

export function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại">
      {bottomNav.map((item) => (
        <Link href={item.href} key={item.href} aria-current={active === item.key ? "page" : undefined}>
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteShell({ children, active }: { children: ReactNode; active: NavKey }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Bỏ qua đến nội dung</a>
      <SiteHeader />
      {children}
      <BottomNav active={active} />
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell admin-shell">
      <header className="container admin-topbar">
        <Link className="brand-lockup" href="/" aria-label="Phan Gia Phả - Trang chủ">
          <Image src="/assets/logo-mark.png" alt="" width={40} height={40} priority />
          <span>Phan Gia Phả<small>Khu vực quản trị</small></span>
        </Link>
        <Link className="button-secondary" href="/">Về trang chính</Link>
      </header>
      {children}
    </div>
  );
}

export function DemoNotice() {
  return <div className="demo-banner" role="note">Dữ liệu minh họa — các tên, ngày và chi trong bản demo đều hư cấu.</div>;
}

export function SectionHeading({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {href && linkLabel ? <Link href={href}>{linkLabel} →</Link> : null}
    </div>
  );
}
