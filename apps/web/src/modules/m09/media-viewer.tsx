"use client";

import Image from "next/image";
import { useState } from "react";

type MediaKind = "image" | "pdf" | "audio" | "video";
type ViewerStatus = "idle" | "loading" | "ready" | "error" | "restricted";

export type MediaViewerItem = {
  id: string;
  title: string;
  kind: MediaKind;
  mimeType: string;
  altText: string | null;
  thumbnailUrl?: string;
  demoUrl?: string;
};

type AccessResponse = { data?: { url?: unknown }; error?: { message?: unknown } };

function isAccessResponse(value: unknown): value is AccessResponse {
  return typeof value === "object" && value !== null;
}

function kindLabel(kind: MediaKind) {
  return kind === "image" ? "Ảnh" : kind === "pdf" ? "PDF" : kind === "audio" ? "Âm thanh" : "Video";
}

function ViewerState({ status, onRetry }: { status: Exclude<ViewerStatus, "ready">; onRetry: () => void }) {
  if (status === "idle") return <p className="media-viewer-hint">Nội dung lớn chỉ tải sau thao tác của bạn.</p>;
  if (status === "loading") return <p className="media-viewer-hint" aria-live="polite">Đang kiểm tra quyền xem…</p>;
  if (status === "restricted") return <div className="media-viewer-state media-viewer-state-restricted"><strong>Tư liệu được giới hạn</strong><span>Phiên hiện tại chưa có quyền xem bản gốc hoặc bản dẫn xuất.</span></div>;
  return <div className="media-viewer-state media-viewer-state-error"><strong>Không tải được tư liệu</strong><span>Quyền và dữ liệu gốc vẫn giữ nguyên.</span><button className="button-secondary" type="button" onClick={onRetry}>Thử lại</button></div>;
}

function AuthorizedMedia({ item, url }: { item: MediaViewerItem; url: string }) {
  if (item.kind === "image") return <div className="media-viewer-image-frame"><Image className="media-viewer-image" src={url} alt={item.altText ?? item.title} fill unoptimized sizes="(max-width: 767px) 100vw, 50vw" /></div>;
  if (item.kind === "pdf") return <div className="media-viewer-document"><p>PDF không được nhúng trình đọc có active content.</p><a className="button-secondary" href={url} download={item.title}>Mở hoặc tải PDF</a></div>;
  if (item.kind === "audio") return <audio className="media-viewer-control" controls preload="none" src={url}>Trình duyệt không hỗ trợ audio. Hãy tải tệp để nghe.</audio>;
  return <video className="media-viewer-video" controls preload="metadata" playsInline poster={item.thumbnailUrl} src={url}>Trình duyệt không hỗ trợ video. Hãy tải tệp để xem.</video>;
}

export function MediaViewer({ item }: { item: MediaViewerItem }) {
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [url, setUrl] = useState<string | null>(item.demoUrl ?? null);
  const [requestVersion, setRequestVersion] = useState(0);

  async function requestAccess() {
    if (item.demoUrl) {
      setUrl(item.demoUrl);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      const response = await fetch(`/api/v1/media/${item.id}/access?variant=${item.kind === "image" ? "640" : "original"}`, { method: "POST", cache: "no-store" });
      const body: unknown = await response.json();
      if (response.status === 401 || response.status === 403) {
        setStatus("restricted");
        return;
      }
      if (!response.ok || !isAccessResponse(body) || typeof body.data?.url !== "string") throw new Error("MEDIA_ACCESS_FAILED");
      setUrl(body.data.url);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  const loaded = status === "ready" && url;
  return (
    <article className="media-viewer-card">
      <div className="media-viewer-heading">
        <div><span className="source-kind">{kindLabel(item.kind)}</span><h3>{item.title}</h3></div>
        <span className="status-label">{item.mimeType}</span>
      </div>
      {loaded ? <AuthorizedMedia item={item} url={url} /> : <div className="media-viewer-placeholder">{item.thumbnailUrl ? <Image src={item.thumbnailUrl} alt="" aria-hidden="true" width={640} height={360} unoptimized /> : <span aria-hidden="true">{kindLabel(item.kind)}</span>}<button className="button-secondary" type="button" onClick={() => { setRequestVersion((value) => value + 1); void requestAccess(); }} disabled={status === "loading"}>{status === "idle" ? "Xem tư liệu" : status === "loading" ? "Đang kiểm tra…" : "Thử xem lại"}</button></div>}
      {status !== "ready" ? <ViewerState key={requestVersion} status={status} onRetry={() => void requestAccess()} /> : null}
      <p className="media-viewer-caption">Không tự phát, không chạy HTML/script nhúng; bản lớn chỉ tải sau khi kiểm tra quyền.</p>
    </article>
  );
}

export function MediaViewerGallery({ items }: { items: MediaViewerItem[] }) {
  if (items.length === 0) return <div className="card empty-state"><strong>Chưa có tư liệu được cấp quyền</strong><p>Ảnh, PDF, âm thanh và video sẽ xuất hiện sau khi kiểm tra an toàn và quyền truy cập.</p></div>;
  return <section className="media-viewer-gallery" aria-label="Trình xem tư liệu">{items.map((item) => <MediaViewer item={item} key={item.id} />)}</section>;
}