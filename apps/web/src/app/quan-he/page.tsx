import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { demoPeople } from "../../lib/demo-data";
import { KinshipFinder } from "../../modules/m05/kinship-finder";

export default function QuanHePage() {
  return (
    <SiteShell active="search">
      <main id="main-content" className="container page">
        <p className="eyebrow">Tra quan hệ · Trong phạm vi được phép xem</p>
        <h1>Đường nối giữa hai người</h1>
        <p className="page-lede">Chỉ hiển thị các node và cạnh đã được phép xem; không suy đoán chắc chắn cách xưng hô.</p>
        <DemoNotice />
        <KinshipFinder people={demoPeople} />
      </main>
    </SiteShell>
  );
}