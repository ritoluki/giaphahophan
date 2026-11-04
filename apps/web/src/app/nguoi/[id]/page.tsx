import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice, SiteShell } from "../../_components/site-chrome";
import { branchName, demoSources, demoTree, findDemoPerson, getDemoFamilyView } from "../../../lib/demo-data";
import { safeNextPath } from "../../../lib/safe-next-path";
import { PersonProfile } from "../../../modules/m03/person-profile";

type PersonPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> };

export default async function PersonPage({ params, searchParams }: PersonPageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const safeFrom = from ? safeNextPath(from) : null;
  const fromFamily = safeFrom?.split("?")[0] === "/gia-pha";
  const person = findDemoPerson(id);
  if (!person) notFound();
  const family = getDemoFamilyView(id);
  const yearLabel = person.birth?.year ? String(person.birth.year) : "Chưa rõ";
  const sources = demoSources.filter((source) => person.sourceIds.includes(source.id));
  return (
    <SiteShell active="search">
      <main id="main-content" tabIndex={-1} className="container page">
        <Link className="muted back-link" href={fromFamily && safeFrom ? safeFrom : "/tra-cuu"}>← {fromFamily ? "Trở lại gia phả" : "Trở lại tra cứu"}</Link>
        <div className="profile-heading"><div><h1>{person.displayName}</h1><p className="page-lede">{branchName(person.branchId)} · {yearLabel === "Chưa rõ" ? "Chưa rõ năm sinh" : `Sinh năm ${yearLabel}`}</p></div></div>
        <div className="profile-actions"><Link className="button-primary" href={"/gia-pha?root=" + person.id}>Xem gia đình</Link><Link className="button-secondary" href={"/quan-he?from=" + person.id}>Xem quan hệ</Link></div>
        <DemoNotice />
        <PersonProfile person={person} family={family} sources={sources} treeId={demoTree.id} version={1} />
      </main>
    </SiteShell>
  );
}
