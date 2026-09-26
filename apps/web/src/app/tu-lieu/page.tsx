import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { demoSources } from "../../lib/demo-data";

export default function SourcesPage() {
  return (
    <SiteShell active="sources">
      <main id="main-content" className="container page">
        <p className="eyebrow">Tư liệu · Có nguồn và quyền truy cập</p>
        <h1>Thư viện tư liệu</h1>
        <p className="page-lede">Nguồn, ảnh và tài liệu chỉ hiển thị theo quyền. File riêng tư không được lấy bằng cách đoán URL.</p>
        <DemoNotice />
        <section className="source-list" aria-label="Nguồn minh họa">
          {demoSources.map((source) => <article className="card source-card" key={source.id}><span className="source-kind">{source.kind}</span><h2>{source.title}</h2><p>{source.provenance}</p><span className="status-label">Nguồn hư cấu · Chỉ phục vụ kiểm thử</span></article>)}
        </section>
      </main>
    </SiteShell>
  );
}
