import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { demoSources } from "../../lib/demo-data";
import { MediaUploadPanel } from "./media-upload-panel";
import { MediaViewerGallery, type MediaViewerItem } from "../../modules/m09/media-viewer";

const demoViewerItems: MediaViewerItem[] = [
  { id: "80000000-0000-4000-8000-000000000101", title: "Ảnh minh họa đã được cấp quyền", kind: "image", mimeType: "image/png", altText: "Minh họa không gian lưu giữ tư liệu", demoUrl: "/assets/hero-mobile.png" },
  { id: "80000000-0000-4000-8000-000000000102", title: "Bản PDF gia phả mẫu", kind: "pdf", mimeType: "application/pdf", altText: null },
  { id: "80000000-0000-4000-8000-000000000103", title: "Lời kể được kiểm tra", kind: "audio", mimeType: "audio/mpeg", altText: null },
  { id: "80000000-0000-4000-8000-000000000104", title: "Video nghi lễ dòng họ", kind: "video", mimeType: "video/mp4", altText: null, thumbnailUrl: "/assets/hero-mobile.png" }
];
export default function SourcesPage() {
  return (
    <SiteShell active="sources">
      <main id="main-content" className="container page">
        <p className="eyebrow">Tư liệu · Có nguồn và quyền truy cập</p>
        <h1>Thư viện tư liệu</h1>
        <p className="page-lede">Nguồn, ảnh và tài liệu chỉ hiển thị theo quyền. File riêng tư không được lấy bằng cách đoán URL.</p>
        <DemoNotice />
        <MediaUploadPanel treeId={null} canUpload={false} />
        <MediaViewerGallery items={demoViewerItems} />
        <section className="source-list" aria-label="Nguồn minh họa">
          {demoSources.map((source) => <article className="card source-card" key={source.id}><span className="source-kind">{source.kind}</span><h2>{source.title}</h2><p>{source.provenance}</p><span className="status-label">Nguồn hư cấu · Chỉ phục vụ kiểm thử</span></article>)}
        </section>
      </main>
    </SiteShell>
  );
}
