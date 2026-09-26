import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice, SiteShell } from "../../_components/site-chrome";
import { branchName, demoSources, demoTree, findDemoPerson, getFamilyFocus } from "../../../lib/demo-data";
import { PersonProfile } from "../../../modules/m03/person-profile";

type PersonPageProps = { params: Promise<{ id: string }> };

export default async function PersonPage({ params }: PersonPageProps) {
  const { id } = await params;
  const person = findDemoPerson(id);
  if (!person) notFound();
  const family = getFamilyFocus(id);
  const yearLabel = person.birth?.year ? String(person.birth.year) : "Chưa rõ";
  const sources = demoSources.filter((source) => person.sourceIds.includes(source.id));
  return (
    <SiteShell active="search">
      <main id="main-content" className="container page">
        <Link className="muted back-link" href="/tra-cuu">← Quay lại tra cứu</Link>
        <p className="eyebrow">Hồ sơ minh họa · {person.externalId}</p>
        <div className="profile-heading"><span className="profile-monogram" aria-hidden="true">{person.displayName.slice(0, 1)}</span><div><h1>{person.displayName}</h1><p className="page-lede">{branchName(person.branchId)} · Mốc năm: {yearLabel}</p></div></div>
        <DemoNotice />
        <PersonProfile person={person} family={family} sources={sources} treeId={demoTree.id} version={1} />
        <section className="card profile-family"><h2>Quan hệ gần</h2><p>Hồ sơ này nằm trong chế độ gia đình gần. Mở cây để xem các mối quan hệ được ghi nhận.</p><Link className="button-primary" href="/gia-pha">Mở cây gia phả</Link></section>
      </main>
    </SiteShell>
  );
}
