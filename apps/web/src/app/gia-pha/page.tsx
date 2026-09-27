import Link from "next/link";
import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { FamilyFocus } from "../_components/family-focus";
import { demoBranches, getFamilyFocus } from "../../lib/demo-data";
import { TreeExplorer } from "../../modules/m04/tree-explorer";

export default function GiaPhaPage() {
  const family = getFamilyFocus();
  return (
    <SiteShell active="tree">
      <main id="main-content" className="container page">
        <p className="eyebrow">Thành viên · Bản demo minh họa</p>
        <h1>Cây gia phả</h1>
        <p className="page-lede">Bắt đầu bằng gia đình gần để đọc được trên điện thoại. Sơ đồ mở rộng chỉ xuất hiện sau thao tác chủ động.</p>
        <DemoNotice />
        <div className="branch-strip" aria-label="Các chi trong bản demo">
          {demoBranches.map((branch) => <span className="tag" key={branch.id}>{branch.code} · {branch.name}</span>)}
        </div>
        {family ? <FamilyFocus family={family} /> : <div className="card empty-state"><h2>Chưa có nhánh được phép xem</h2><p>Không có dữ liệu gia phả trong phạm vi hiện tại.</p><Link className="button-primary" href="/dang-nhap">Đăng nhập theo lời mời</Link></div>}
        {family ? <TreeExplorer rootId={family.person.id} /> : null}
        <div className="restricted-card"><strong>Quyền truy cập</strong><p>Trong dữ liệu thật, projection và các nút mở rộng sẽ được kiểm tra ở server/DB. Ẩn nút trên giao diện không thay thế authorization.</p></div>
      </main>
    </SiteShell>
  );
}
