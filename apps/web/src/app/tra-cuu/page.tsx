import Link from "next/link";
import { Suspense } from "react";
import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { SearchResults } from "../_components/search-results";
import { demoBranches, demoPeople } from "../../lib/demo-data";

export default function SearchPage() {
  return (
    <SiteShell active="search">
      <main id="main-content" tabIndex={-1} className="container page">
        <h1>Tìm người trong gia phả</h1>
        <p className="page-lede">Nhập tên, tên gọi khác hoặc mã hồ sơ. Dùng chi họ và năm sinh để phân biệt người trùng tên.</p>
        <DemoNotice />
        <Suspense fallback={<p role="status">Đang tải tra cứu…</p>}><SearchResults people={demoPeople} branches={demoBranches} remoteSearch={process.env.DATA_MODE === "real"} /></Suspense>
        <p><Link className="button-secondary" href="/quan-he">Xem quan hệ giữa hai người</Link></p>
      </main>
    </SiteShell>
  );
}
