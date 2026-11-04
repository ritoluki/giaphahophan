import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { demoSources } from "../../lib/demo-data";
import { MediaUploadPanel } from "./media-upload-panel";
import { MediaViewerGallery, type MediaViewerItem } from "../../modules/m09/media-viewer";
import { sourceKindLabel } from "../../lib/ui-labels";

const demoViewerItems: MediaViewerItem[] = [
  { id: "80000000-0000-4000-8000-000000000101", title: "Ảnh minh họa gia phả", kind: "image", mimeType: "image/png", altText: "Minh họa không gian lưu giữ tư liệu", demoUrl: "/assets/hero-mobile.png" },
  { id: "80000000-0000-4000-8000-000000000102", title: "Bản PDF gia phả mẫu", kind: "pdf", mimeType: "application/pdf", altText: null },
  { id: "80000000-0000-4000-8000-000000000103", title: "Bản ghi âm lời kể minh họa", kind: "audio", mimeType: "audio/mpeg", altText: null },
  { id: "80000000-0000-4000-8000-000000000104", title: "Đoạn phim nghi lễ minh họa", kind: "video", mimeType: "video/mp4", altText: null, thumbnailUrl: "/assets/hero-mobile.png" }
];
export default function SourcesPage() {
  return (
    <SiteShell active="sources">
      <main id="main-content" tabIndex={-1} className="container page">
        <h1>Thư viện tư liệu</h1>
        <p className="page-lede">Ảnh, tài liệu và lời kể được gìn giữ cùng gia phả.</p>
        <DemoNotice />
        <MediaUploadPanel treeId={null} canUpload={false} />
        <MediaViewerGallery items={demoViewerItems} />
        <section className="source-list" aria-label="Nguồn minh họa">
          {demoSources.map((source) => <article className="card source-card" key={source.id}><h2>{source.title}</h2><p>{sourceKindLabel(source.kind)} · {source.provenance}</p><span className="status-label">Tư liệu minh họa</span></article>)}
        </section>
      </main>
    </SiteShell>
  );
}
