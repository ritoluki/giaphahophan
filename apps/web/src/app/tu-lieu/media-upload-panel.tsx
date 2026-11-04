"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { getUiErrorMessage } from "../../lib/ui-error";

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
  const [message, setMessage] = useState(canUpload && treeId ? "Tệp sẽ được kiểm tra trước khi thêm vào thư viện." : "Bạn cần đăng nhập và có quyền thêm tư liệu để tải tệp lên.");

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canUpload || !treeId) {
      setStatus("restricted");
      setMessage("Bạn cần đăng nhập và có quyền thêm tư liệu cho gia phả này.");
      return;
    }
    if (file.size < 1 || file.size > 104857600) {
      setStatus("error");
      setMessage("Chọn tệp có dung lượng từ 1 byte đến 100 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setStatus("reading");
    setMessage("Đang kiểm tra tệp trước khi tải lên…");
    try {
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
      if (!intentResponse.ok || !intentBody.data) throw intentBody.error;
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
      if (!finalizeResponse.ok || finalizeBody.data?.state !== "ready") throw finalizeBody.error;
      setStatus("success");
      setMessage("Tệp đã được kiểm tra và sẵn sàng sử dụng.");
    } catch (error) {
      setStatus("error");
      setMessage(getUiErrorMessage(error, "Chưa thể thêm tư liệu. Tệp chưa được đưa vào thư viện; hãy thử lại sau."));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = status === "reading" || status === "uploading" || status === "finalizing";
  return (
    <section className="card media-upload-panel" aria-labelledby="media-upload-title">
      <div>
        <h2 id="media-upload-title">Thêm tư liệu cho gia phả</h2>
        <p>Chọn ảnh, tài liệu PDF, bản ghi âm hoặc đoạn phim từ thiết bị của bạn.</p>
      </div>
      <label className="media-upload-dropzone">
        <span>{busy ? "Đang xử lý…" : "Chọn tệp từ thiết bị"}</span>
        <small id="media-upload-help">Tối đa 100 MB. Nhận ảnh JPG, PNG, WebP; tài liệu PDF; âm thanh MP3, M4A và phim MP4.</small>
        <input ref={inputRef} type="file" aria-describedby="media-upload-help" accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp4,video/mp4" disabled={busy || !canUpload || !treeId} onChange={onFileChange} />
      </label>
      <p className={"media-upload-status media-upload-status-" + status} aria-live="polite">{message}</p>
    </section>
  );
}
