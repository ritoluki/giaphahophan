import Link from "next/link";
import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { SearchBox } from "../_components/search-box";
import { SearchResults } from "../_components/search-results";
import { demoBranches, demoPeople } from "../../lib/demo-data";

type SearchPageProps = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const initialQuery = params.q ?? "";
  return (
    <SiteShell active="search">
      <main id="main-content" className="container page">
        <p className="eyebrow">Tra cứu · Trong phạm vi được phép xem</p>
        <h1>Tìm người trong gia phả</h1>
        <p className="page-lede">Tên trùng sẽ luôn đi cùng mã hồ sơ, chi và mốc năm trong kết quả demo.</p>
        <SearchBox initialValue={initialQuery} compact />
        <DemoNotice />
        <p><Link className="button-secondary" href="/quan-he">Tra quan hệ giữa hai người →</Link></p>
        <SearchResults people={demoPeople} branches={demoBranches} initialQuery={initialQuery} />
      </main>
    </SiteShell>
  );
}
