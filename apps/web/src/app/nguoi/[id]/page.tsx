import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice, SiteShell } from "../../_components/site-chrome";
import { branchName, findDemoPerson, getFamilyFocus } from "../../../lib/demo-data";

type PersonPageProps = { params: Promise<{ id: string }> };

export default async function PersonPage({ params }: PersonPageProps) {
  const { id } = await params;
  const person = findDemoPerson(id);
  if (!person) notFound();
  const family = getFamilyFocus(id);
  const yearLabel = person.birth?.year ? String(person.birth.year) : "Chưa rõ";
  return (
    <SiteShell active="search">
      <main id="main-content" className="container page">
        <Link className="muted back-link" href="/tra-cuu">← Quay lại tra cứu</Link>
        <p className="eyebrow">Hồ sơ minh họa · {person.externalId}</p>
        <div className="profile-heading"><span className="profile-monogram" aria-hidden="true">{person.displayName.slice(0, 1)}</span><div><h1>{person.displayName}</h1><p className="page-lede">{branchName(person.branchId)} · Mốc năm: {yearLabel}</p></div></div>
        <DemoNotice />
        <div className="profile-grid">
          <section className="card"><h2>Thông tin đã ghi nhận</h2><dl className="detail-list"><div><dt>Trạng thái</dt><dd>{person.lifeStatus === "deceased" ? "Đã qua đời · demo" : "Chưa xác định · demo"}</dd></div><div><dt>Năm sinh</dt><dd>{yearLabel}</dd></div><div><dt>Chi họ</dt><dd>{branchName(person.branchId)}</dd></div><div><dt>Hiển thị</dt><dd>Thành viên · bản minh họa</dd></div></dl></section>
          <section className="card"><h2>Ghi chú tiểu sử</h2><p>{person.biography}</p><p className="source-note">Nguồn: dữ liệu fixture hư cấu của agent kit.</p></section>
        </div>
        {family ? <section className="card profile-family"><h2>Quan hệ gần</h2><p>Hồ sơ này nằm trong chế độ gia đình gần. Mở cây để xem các mối quan hệ được ghi nhận.</p><Link className="button-primary" href="/gia-pha">Mở cây gia phả</Link></section> : null}
      </main>
    </SiteShell>
  );
}
