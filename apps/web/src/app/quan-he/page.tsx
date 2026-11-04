import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { demoPeople } from "../../lib/demo-data";
import { KinshipFinder } from "../../modules/m05/kinship-finder";

export default async function QuanHePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <SiteShell active="search">
      <main id="main-content" tabIndex={-1} className="container page">
        <h1>Quan hệ giữa hai người</h1>
        <p className="page-lede">Chọn hai người để xem họ liên hệ với nhau qua những ai trong gia phả.</p>
        <DemoNotice />
        <KinshipFinder people={demoPeople} initialFromId={from} />
      </main>
    </SiteShell>
  );
}
