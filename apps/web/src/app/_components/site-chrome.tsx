import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteIcon, type SiteIconName } from "./site-icon";

export type NavKey = "home" | "tree" | "search" | "sources" | "calendar" | "more";

const primaryNav = [
  { href: "/gioi-thieu", label: "Giới thiệu" },
  { href: "/gia-pha", label: "Gia phả" },
  { href: "/lich-ho", label: "Lịch họ" },
  { href: "/tu-lieu", label: "Tư liệu" },
  { href: "/tin-ho", label: "Tin họ" }
] as const;

const bottomNav: Array<{ href: string; label: string; icon: SiteIconName; key: NavKey }> = [
  { href: "/", label: "Trang chủ", icon: "home", key: "home" },
  { href: "/gia-pha", label: "Gia phả", icon: "family", key: "tree" },
  { href: "/tra-cuu", label: "Tra cứu", icon: "search", key: "search" },
  { href: "/lich-ho", label: "Lịch họ", icon: "calendar", key: "calendar" },
  { href: "/them", label: "Thêm", icon: "more", key: "more" }
];

export function SiteHeader() {
  return (
    <header className="container topbar">
      <Link className="brand-lockup" href="/" aria-label="Phan Gia Phả - Trang chủ">
        <Image src="/assets/logo-mark.png" alt="" width={48} height={48} priority />
        <span>
          Phan Gia Phả
          <small>Gia phả của gia đình</small>
        </span>
      </Link>
      <nav className="desktop-nav" aria-label="Điều hướng chính">
        {primaryNav.map((item) => (
          <Link href={item.href} key={item.href}>{item.label}</Link>
        ))}
      </nav>
      <Link className="account-link" href="/them#session-heading"><SiteIcon name="account" /><span>Tài khoản</span></Link>
    </header>
  );
}

export function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại">
      {bottomNav.map((item) => (
        <Link href={item.href} key={item.href} aria-current={active === item.key ? "page" : undefined}>
          <SiteIcon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function SkipLink() {
  return <a className="skip-link" href="#main-content">Đến nội dung chính</a>;
}

export function SiteShell({ children, active }: { children: ReactNode; active: NavKey }) {
  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader />
      {children}
      <BottomNav active={active} />
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell admin-shell">
      <SkipLink />
      <header className="container admin-topbar">
        <Link className="brand-lockup" href="/" aria-label="Phan Gia Phả - Trang chủ">
          <Image src="/assets/logo-mark.png" alt="" width={40} height={40} priority />
          <span>Phan Gia Phả<small>Khu vực quản trị</small></span>
        </Link>
        <Link className="button-secondary" href="/">Trang chính</Link>
      </header>
      <nav className="container admin-navigation" aria-label="Quản lý gia phả">
        <Link href="/quan-tri">Tổng quan</Link>
        <Link href="/quan-tri/thanh-vien">Thành viên</Link>
        <Link href="/quan-tri/nhap-lieu">Nhập dữ liệu</Link>
        <Link href="/quan-tri/xuat-lieu">Xuất gia phả</Link>
      </nav>
      {children}
    </div>
  );
}

export function DemoNotice() {
  return <div className="demo-banner" role="note"><span className="demo-mark" aria-hidden="true" />Dữ liệu minh họa. Tên và thông tin trong bản này đều hư cấu.</div>;
}

export function SectionHeading({ title, href, linkLabel, id }: { title: string; href?: string; linkLabel?: string; id?: string }) {
  return (
    <div className="section-heading">
      <h2 id={id}>{title}</h2>
      {href && linkLabel ? <Link href={href}>{linkLabel}<SiteIcon name="arrow" size={18} /></Link> : null}
    </div>
  );
}
