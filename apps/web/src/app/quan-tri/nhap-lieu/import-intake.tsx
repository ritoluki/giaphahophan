"use client";

import { FormEvent, useEffect, useState } from "react";

type Envelope<T> = { data?: T; meta?: { requestId?: string } };
type UploadIntent = { assetId: string; uploadUrl: string; requiredHeaders: Record<string, string> };
type ImportTree = { id: string; name: string };
type ImportJob = {
  id: string; version: number; status: string; counters: { processed: number; succeeded: number; failed: number; skipped: number };
  warnings: string[]; fileSha256: string; classification: string;
};

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json() as Envelope<T>;
  if (!response.ok || body.data === undefined) throw new Error(`Yêu cầu chưa hoàn tất (${response.status}). Hãy kiểm tra quyền và thử lại an toàn.`);
  return body.data;
}

export function ImportIntake() {
  const [treeId, setTreeId] = useState("");
  const [trees, setTrees] = useState<ImportTree[]>([]);
  const [loadingTrees, setLoadingTrees] = useState(true);
  const [sourceNamespace, setSourceNamespace] = useState("family-records");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/imports", { cache: "no-store" }).then(async (response) => responseData<ImportTree[]>(response))
      .then((items) => { if (active) { setTrees(items); setTreeId(items[0]?.id ?? ""); } })
      .catch(() => { if (active) setError("Không tải được danh sách cây được cấp quyền nhập liệu. Hãy đăng nhập bằng tài khoản có imports.manage."); })
      .finally(() => { if (active) setLoadingTrees(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError("Vui lòng chọn tệp JSON."); return; }
    setPending(true); setError(""); setJob(null);
    try {
      const tree = treeId.trim();
      if (!trees.some((item) => item.id === tree)) throw new Error("Vui lòng chọn cây gia phả có quyền nhập liệu.");
      if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error("Tệp JSON phải nhỏ hơn hoặc bằng 10 MiB.");
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const mimeType = "application/json";
      const intentResponse = await fetch("/api/v1/media/uploads", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ treeId: tree, filename: file.name, mimeType, sizeBytes: file.size, sha256, purpose: "import", visibility: "restricted" })
      });
      const intent = await responseData<UploadIntent>(intentResponse);
      const uploadResponse = await fetch(intent.uploadUrl, { method: "PUT", headers: intent.requiredHeaders, body: bytes });
      await responseData<unknown>(uploadResponse);
      const finalizeResponse = await fetch(`/api/v1/media/${intent.assetId}/finalize`, {
        method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }
      });
      await responseData<unknown>(finalizeResponse);
      const importResponse = await fetch("/api/v1/imports", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ treeId: tree, assetId: intent.assetId, format: "canonical_json", sourceNamespace: sourceNamespace.trim(), mappingVersion: "canonical-json/1", mode: "demo" })
      });
      setJob(await responseData<ImportJob>(importResponse));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tiếp nhận tệp lúc này.");
    } finally { setPending(false); }
  }

  return (
    <section className="import-workspace" aria-labelledby="import-step-title">
      <div className="import-stepper" aria-label="Quy trình tiếp nhận">
        <span aria-current="step"><b>1</b> Tư liệu</span><span><b>2</b> Kiểm tra</span><span><b>3</b> Rà soát</span>
      </div>
      <form className="card import-form" onSubmit={submit}>
        <h2 id="import-step-title">Bản nhập demo</h2>
        <p className="muted">Chỉ nhận JSON UTF-8 theo envelope canonical hiện hỗ trợ. Tệp được giữ trong bucket private; bản gốc không xuất hiện trong phản hồi.</p>
        <label htmlFor="import-tree">Cây gia phả được cấp quyền</label>
        <select id="import-tree" required value={treeId} disabled={loadingTrees || trees.length === 0} onChange={(event) => setTreeId(event.target.value)}>
          {loadingTrees && <option value="">Đang tải danh sách…</option>}
          {!loadingTrees && trees.length === 0 && <option value="">Không có cây được cấp quyền</option>}
          {trees.map((tree) => <option key={tree.id} value={tree.id}>{tree.name}</option>)}
        </select>
        <label htmlFor="import-source">Không gian nguồn</label>
        <input id="import-source" required maxLength={200} value={sourceNamespace} onChange={(event) => setSourceNamespace(event.target.value)} />
        <label htmlFor="import-file">Tệp JSON · tối đa 10 MiB</label>
        <input id="import-file" type="file" accept="application/json,.json" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <p className="import-safety-note">Chế độ demo không áp dụng thay đổi vào gia phả chính. Dữ liệu thật đang bị khóa cho đến khi có phê duyệt H5.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button-primary" type="submit" disabled={pending}>{pending ? "Đang kiểm tra và tiếp nhận…" : "Tải lên và chạy dry-run"}</button>
      </form>
      {pending && <div className="card import-result" role="status" aria-live="polite"><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /><p>Đang xác minh tệp trong kho riêng. Không đóng trang cho đến khi hoàn tất.</p></div>}
      {job && <section className="card import-result" aria-live="polite" aria-labelledby="import-result-title">
        <span className="status-label">{job.status === "needs_review" ? "Cần rà soát" : job.status}</span>
        <h2 id="import-result-title">Kết quả dry-run</h2>
        <dl className="import-counts"><div><dt>Tổng dòng</dt><dd>{job.counters.processed}</dd></div><div><dt>Hợp lệ</dt><dd>{job.counters.succeeded}</dd></div><div><dt>Cần sửa</dt><dd>{job.counters.failed}</dd></div><div><dt>Cần rà soát</dt><dd>{job.counters.skipped}</dd></div></dl>
        <p>Phân loại: {job.classification}. Checksum SHA-256: <code className="import-hash">{job.fileSha256}</code></p>
        {job.warnings.length > 0 && <div><h3>Lưu ý</h3><ul>{job.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
        <p className="import-safety-note">Chưa có dữ liệu canonical nào được ghi. Bước áp dụng sẽ chỉ mở khi có luồng review được phê duyệt.</p>
      </section>}
    </section>
  );
}
