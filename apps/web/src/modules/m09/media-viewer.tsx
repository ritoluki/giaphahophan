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
  return kind === "image" ? "Ảnh" : kind === "pdf" ? "Tài liệu PDF" : kind === "audio" ? "Bản ghi âm" : "Đoạn phim";
}

function ViewerState({ status, onRetry }: { status: Exclude<ViewerStatus, "ready">; onRetry: () => void }) {
  if (status === "idle") return <p className="media-viewer-hint">Chọn “Xem tư liệu” để tải nội dung.</p>;
  if (status === "loading") return <p className="media-viewer-hint" aria-live="polite">Đang mở tư liệu…</p>;
  if (status === "restricted") return <div className="media-viewer-state media-viewer-state-restricted"><strong>Bạn chưa có quyền xem tư liệu này</strong><span>Hãy đăng nhập hoặc liên hệ người phụ trách gia phả.</span></div>;
  return <div className="media-viewer-state media-viewer-state-error"><strong>Không tải được tư liệu</strong><span>Hãy kiểm tra kết nối rồi thử lại.</span><button className="button-secondary" type="button" onClick={onRetry}>Thử lại</button></div>;
}

function AuthorizedMedia({ item, url }: { item: MediaViewerItem; url: string }) {
  if (item.kind === "image") return <div className="media-viewer-image-frame"><Image className="media-viewer-image" src={url} alt={item.altText ?? item.title} fill unoptimized sizes="(max-width: 767px) 100vw, 50vw" /></div>;
  if (item.kind === "pdf") return <div className="media-viewer-document"><p>Tải tài liệu về thiết bị để đọc.</p><a className="button-secondary" href={url} download={item.title}>Tải tài liệu PDF</a></div>;
  if (item.kind === "audio") return <audio className="media-viewer-control" aria-label={item.title} controls preload="none" src={url}>Trình duyệt không phát được bản ghi âm này. <a href={url} download>Tải về để nghe</a>.</audio>;
  return <video className="media-viewer-video" aria-label={item.title} controls preload="metadata" playsInline poster={item.thumbnailUrl} src={url}>Trình duyệt không phát được đoạn phim này. <a href={url} download>Tải về để xem</a>.</video>;
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
        <div><h3>{item.title}</h3><span className="source-kind">{kindLabel(item.kind)}</span></div>
      </div>
      {loaded ? <AuthorizedMedia item={item} url={url} /> : <div className="media-viewer-placeholder">{item.thumbnailUrl ? <Image src={item.thumbnailUrl} alt="" aria-hidden="true" width={640} height={360} unoptimized /> : <span aria-hidden="true">{kindLabel(item.kind)}</span>}<button className="button-secondary" type="button" onClick={() => { setRequestVersion((value) => value + 1); void requestAccess(); }} disabled={status === "loading"}>{status === "idle" ? "Xem tư liệu" : status === "loading" ? "Đang kiểm tra…" : "Thử xem lại"}</button></div>}
      {status !== "ready" ? <ViewerState key={requestVersion} status={status} onRetry={() => void requestAccess()} /> : null}
    </article>
  );
}

export function MediaViewerGallery({ items }: { items: MediaViewerItem[] }) {
  if (items.length === 0) return <div className="card empty-state"><strong>Chưa có tư liệu để xem</strong><p>Ảnh và tài liệu được chia sẻ với bạn sẽ xuất hiện ở đây.</p></div>;
  return <section className="media-viewer-gallery" aria-label="Trình xem tư liệu">{items.map((item) => <MediaViewer item={item} key={item.id} />)}</section>;
}
