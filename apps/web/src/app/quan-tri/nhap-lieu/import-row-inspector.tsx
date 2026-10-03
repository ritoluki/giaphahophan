"use client";

import { useEffect, useState } from "react";
import { importRowsPageSchema } from "@phan/contracts";
import type { z } from "zod";

type RowPage = z.infer<typeof importRowsPageSchema>;

export function ImportRowInspector({ jobId, version, editable, onSelect }: {
  jobId: string; version: number; editable: boolean; onSelect: (rowNumber: number, excluded: boolean) => void;
}) {
  const [after, setAfter] = useState(0);
  const [previous, setPrevious] = useState<number[]>([]);
  const [page, setPage] = useState<RowPage | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError(""); } });
    fetch(`/api/v1/imports/${jobId}/rows?baseVersion=${version}&after=${after}`, { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const envelope: unknown = await response.json();
        if (!response.ok) {
          const meta = envelope && typeof envelope === "object" && "meta" in envelope ? envelope.meta : null;
          const requestId = meta && typeof meta === "object" && "requestId" in meta && typeof meta.requestId === "string" && /^[a-f0-9-]{36}$/i.test(meta.requestId) ? ` Mã yêu cầu: ${meta.requestId}.` : "";
          throw new Error((response.status === 409 ? "Bản nhập đã thay đổi. Hãy tải lại trạng thái để xem phiên bản mới." : "Không tải được dòng. Kiểm tra phiên đăng nhập và quyền nhập liệu.") + requestId);
        }
        if (!envelope || typeof envelope !== "object" || !("data" in envelope)) throw new Error("Phản hồi dòng không hợp lệ.");
        const result = importRowsPageSchema.parse(envelope.data);
        if (result.jobId !== jobId || result.version !== version) throw new Error("Phiên bản dòng không khớp bản nhập.");
        if (!abort.signal.aborted) setPage(result);
      })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được dòng."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [jobId, version, after, retry]);
  return <section className="import-row-inspector" aria-labelledby="import-all-rows-title">
    <h3 id="import-all-rows-title">Rà soát toàn bộ dòng</h3>
    <p className="muted">Mỗi trang tối đa 50 dòng, cố định theo phiên bản bản nhập. Tư liệu thô và lý do riêng tư không xuất hiện trong danh sách.</p>
    {loading ? <p role="status">Đang tải dòng…</p> : error ? <div><p role="alert">{error}</p><button type="button" className="button-secondary" onClick={() => setRetry((value) => value + 1)}>Thử tải lại dòng</button></div> : <>
      {page?.rows.length === 0 ? <p>Không có dòng ở trang này.</p> : <ul className="import-row-list">{page?.rows.map((row) => <li className="import-row-card" key={row.rowNumber}>
        <div className="import-row-heading"><strong>Dòng {row.rowNumber}: {row.displayName}</strong><span className="tag">{row.excluded ? "Đã loại trừ" : row.status === "valid" ? "Hợp lệ" : row.status === "review" ? "Cần rà soát" : "Cần sửa"}</span></div>
        <p>Mã nguồn: <code>{row.externalId}</code></p>
        {row.errors.length > 0 && <ul>{row.errors.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}
        {editable && <button className="button-secondary" type="button" onClick={() => onSelect(row.rowNumber, row.excluded)}>Chọn dòng {row.rowNumber}</button>}
      </li>)}</ul>}
      <nav aria-label="Trang dòng nhập liệu" className="import-row-pagination">
        <button className="button-secondary" type="button" disabled={previous.length === 0} onClick={() => { setAfter(previous[previous.length - 1] ?? 0); setPrevious(previous.slice(0, -1)); }}>Trang dòng trước</button>
        <button className="button-secondary" type="button" disabled={page?.nextCursor == null} onClick={() => { if (page?.nextCursor != null) { setPrevious([...previous, after]); setAfter(page.nextCursor); } }}>Trang dòng tiếp</button>
      </nav>
    </>}
  </section>;
}
