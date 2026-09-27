"use client";

import { useRef, useState, type ChangeEvent } from "react";

type UploadStatus = "idle" | "reading" | "uploading" | "finalizing" | "success" | "error" | "restricted";

type Props = {
  treeId: string | null;
  canUpload: boolean;
};

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function MediaUploadPanel({ treeId, canUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>(canUpload && treeId ? "idle" : "restricted");
  const [message, setMessage] = useState("Tệp chỉ được hiển thị sau khi kiểm tra an toàn hoàn tất.");

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canUpload || !treeId) {
      setStatus("restricted");
      setMessage("Bạn cần đăng nhập và có quyền thêm tư liệu cho gia phả này.");
      return;
    }
    setStatus("reading");
    setMessage("Đang kiểm tra tệp trước khi tải lên…");
    try {
      if (file.size < 1 || file.size > 104857600) throw new Error("Kích thước tệp không được hỗ trợ.");
      const digest = await sha256(file);
      const intentResponse = await fetch("/api/v1/media/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          treeId,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          sha256: digest,
          purpose: "album",
          visibility: "restricted"
        })
      });
      const intentBody = await intentResponse.json() as { data?: { assetId: string; uploadUrl: string }; error?: { message?: string } };
      if (!intentResponse.ok || !intentBody.data) throw new Error(intentBody.error?.message ?? "Không thể tạo phiên tải lên.");
      setStatus("uploading");
      setMessage("Đang tải tệp vào vùng lưu trữ riêng tư…");
      const uploadResponse = await fetch(intentBody.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, "Content-Length": String(file.size) },
        body: file
      });
      if (!uploadResponse.ok) throw new Error("Tệp không vượt qua bước kiểm tra nội dung.");
      setStatus("finalizing");
      setMessage("Đang quét an toàn và hoàn tất xử lý…");
      const finalizeResponse = await fetch("/api/v1/media/" + intentBody.data.assetId + "/finalize", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: "{}"
      });
      const finalizeBody = await finalizeResponse.json() as { data?: { state?: string }; error?: { message?: string } };
      if (!finalizeResponse.ok || finalizeBody.data?.state !== "ready") throw new Error(finalizeBody.error?.message ?? "Tệp đang bị giữ lại để kiểm tra.");
      setStatus("success");
      setMessage("Tệp đã được kiểm tra và sẵn sàng sử dụng.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Không thể hoàn tất tải lên.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = status === "reading" || status === "uploading" || status === "finalizing";
  return (
    <section className="card media-upload-panel" aria-labelledby="media-upload-title">
      <div>
        <p className="eyebrow">Tải lên an toàn</p>
        <h2 id="media-upload-title">Thêm tư liệu cho gia phả</h2>
        <p>Ảnh, PDF, âm thanh và video được kiểm tra loại tệp, kích thước, checksum và scanner trước khi hiển thị.</p>
      </div>
      <label className="media-upload-dropzone">
        <span>{busy ? "Đang xử lý…" : "Chọn tệp từ thiết bị"}</span>
        <small>Không nhận SVG, HTML, executable hoặc macro office.</small>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp4,video/mp4" disabled={busy || !canUpload || !treeId} onChange={onFileChange} />
      </label>
      <p className={"media-upload-status media-upload-status-" + status} aria-live="polite">{message}</p>
    </section>
  );
}
