"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { importRelationshipMappingResultSchema, importRelationshipMappingSchema, importRelationshipRowsPageSchema, type ImportRelationshipMapping } from "@phan/contracts";
import type { z } from "zod";

type Page = z.infer<typeof importRelationshipRowsPageSchema>;
type Family = Page["families"][number];
type Edge = ImportRelationshipMapping["parentLinks"][number];

function FamilyCard({ family, jobId, version, snapshotHash, csrfToken, editable, onSaved }: {
  family: Family; jobId: string; version: number; snapshotHash: string; csrfToken: string; editable: boolean; onSaved: () => Promise<void>;
}) {
  const [partners, setPartners] = useState<string[]>(family.savedMapping?.partnerExternalIds ?? []);
  const [children, setChildren] = useState<string[]>(family.savedMapping?.childExternalIds ?? []);
  const [edges, setEdges] = useState<Edge[]>(family.savedMapping?.parentLinks ?? []);
  const [parent, setParent] = useState(""); const [child, setChild] = useState("");
  const [kind, setKind] = useState<Edge["kind"] | "">(""); const [status, setStatus] = useState<Edge["status"] | "">("");
  const [reason, setReason] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const selectable = (item: Family["partners"][number]) => (item.status === "valid" || item.relationshipOnlyReview) && !item.excluded;
  const toggle = (values: string[], update: (next: string[]) => void, value: string, checked: boolean) =>
    update(checked ? [...values, value] : values.filter((entry) => entry !== value));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const parsed = importRelationshipMappingSchema.safeParse({ baseVersion: version, snapshotHash, familyExternalId: family.familyExternalId,
      partnerExternalIds: partners, childExternalIds: children, parentLinks: edges, reason });
    if (!parsed.success) { setError("Chọn ít nhất một người phối ngẫu hợp lệ và ghi rõ lý do rà soát."); return; }
    const signature = JSON.stringify({ jobId, ...parsed.data });
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() };
    setSaving(true);
    try {
      const response = await fetch(`/api/v1/imports/${jobId}/relationships`, { method: "POST", headers: {
        "Content-Type": "application/json", "Idempotency-Key": keyRef.current.key, "X-CSRF-Token": csrfToken,
      }, body: JSON.stringify(parsed.data) });
      const envelope: unknown = await response.json();
      if (!response.ok) {
        const message = envelope && typeof envelope === "object" && "data" in envelope && envelope.data && typeof envelope.data === "object" && "message" in envelope.data && typeof envelope.data.message === "string"
          ? envelope.data.message : `Chưa lưu được mapping (${response.status}).`;
        throw new Error(message);
      }
      if (!envelope || typeof envelope !== "object" || !("data" in envelope)) throw new Error("Phản hồi mapping không hợp lệ.");
      importRelationshipMappingResultSchema.parse(envelope.data);
      setReason(""); keyRef.current = null; await onSaved();
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Chưa lưu được mapping."); }
    finally { setSaving(false); }
  }

  return <article className="import-row-card import-relationship-card">
    <div className="import-row-heading"><strong>Gia đình nguồn · dòng {family.rowNumber}</strong><span className="tag"><code>{family.familyExternalId}</code></span></div>
    <p>Chỉ chọn những thành viên được ghi rõ trong nguồn; nhãn HUSB/WIFE không được dùng để suy giới tính hay vai trò.</p>
    <form className="import-relationship-form" onSubmit={save}>
      <fieldset><legend>Người phối ngẫu theo nguồn</legend>{family.partners.length ? family.partners.map((item, index) => <label className="import-check" key={`${item.externalId}-${index}`}>
        <input type="checkbox" checked={partners.includes(item.externalId)} disabled={!editable || saving || !selectable(item)}
          onChange={(event) => toggle(partners, setPartners, item.externalId, event.target.checked)} />
        <span>{item.displayName} · <code>{item.externalId}</code>{item.excluded ? " · đã loại trừ" : item.relationshipOnlyReview ? " · chờ mapping quan hệ" : !selectable(item) ? " · cần sửa dòng người" : ""}</span>
      </label>) : <p>Không có người phối ngẫu trong nguồn.</p>}</fieldset>
      <fieldset><legend>Con theo nguồn</legend>{family.children.length ? family.children.map((item, index) => <label className="import-check" key={`${item.externalId}-${index}`}>
        <input type="checkbox" checked={children.includes(item.externalId)} disabled={!editable || saving || !selectable(item)}
          onChange={(event) => toggle(children, setChildren, item.externalId, event.target.checked)} />
        <span>{item.displayName} · <code>{item.externalId}</code>{item.excluded ? " · đã loại trừ" : item.relationshipOnlyReview ? " · chờ mapping quan hệ" : !selectable(item) ? " · cần sửa dòng người" : ""}</span>
      </label>) : <p>Không có con được ghi trong nguồn.</p>}</fieldset>
      <fieldset><legend>Quan hệ cha/mẹ – con cần ghi rõ riêng</legend>
        <p>Thành viên cùng gia đình không tự tạo quan hệ cha/mẹ. Chỉ các cặp dưới đây sẽ được xem xét riêng.</p>
        <label>Cha/mẹ<select value={parent} onChange={(event) => setParent(event.target.value)} disabled={!editable || saving}>
          <option value="">Chọn người phối ngẫu</option>{family.partners.filter((item) => partners.includes(item.externalId) && selectable(item)).map((item) => <option key={item.externalId} value={item.externalId}>{item.displayName} · {item.externalId}</option>)}
        </select></label>
        <label>Con<select value={child} onChange={(event) => setChild(event.target.value)} disabled={!editable || saving}>
          <option value="">Chọn người con</option>{family.children.filter((item) => children.includes(item.externalId) && selectable(item)).map((item) => <option key={item.externalId} value={item.externalId}>{item.displayName} · {item.externalId}</option>)}
        </select></label>
        <label>Loại quan hệ<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} disabled={!editable || saving}>
          <option value="">Chọn loại — không tự suy đoán</option><option value="biological">Sinh học</option><option value="adoptive">Nuôi dưỡng</option><option value="guardian">Giám hộ</option><option value="step">Kế dưỡng</option>
        </select></label>
        <label>Tình trạng<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} disabled={!editable || saving}>
          <option value="">Chọn mức xác nhận</option><option value="confirmed">Đã xác nhận theo nguồn</option><option value="disputed">Còn tranh nghị</option>
        </select></label>
        <button className="button-secondary" type="button" disabled={!editable || saving || !parent || !child || !kind || !status || parent === child}
          onClick={() => { const edge: Edge = { parentExternalId: parent, childExternalId: child, kind: kind as Edge["kind"], status: status as Edge["status"] }; setEdges([...edges, edge]); setParent(""); setChild(""); setKind(""); setStatus(""); }}>
          Thêm quan hệ tường minh
        </button>
        {edges.length > 0 && <ul className="import-row-list">{edges.map((edge, index) => <li className="import-row-card" key={`${edge.parentExternalId}-${edge.childExternalId}-${edge.kind}-${index}`}>
          <span>{edge.parentExternalId} → {edge.childExternalId} · {edge.kind} · {edge.status}</span>
          {editable && <button className="button-secondary" type="button" disabled={saving} onClick={() => setEdges(edges.filter((_, itemIndex) => itemIndex !== index))}>Bỏ quan hệ này</button>}
        </li>)}</ul>}
      </fieldset>
      <label>Lý do đối chiếu mapping<textarea required minLength={1} maxLength={1000} value={reason} disabled={!editable || saving} onChange={(event) => setReason(event.target.value)} placeholder="Ghi ngắn gọn căn cứ chọn các thành viên và quan hệ." /></label>
      {error && <p role="alert" className="field-error">{error}</p>}
      {editable && <button className="button-primary" type="submit" disabled={saving}>{saving ? "Đang lưu mapping…" : "Lưu quyết định riêng tư"}</button>}
    </form>
  </article>;
}

export function ImportRelationshipEditor({ jobId, version, snapshotHash, csrfToken, editable, onSaved }: {
  jobId: string; version: number; snapshotHash: string; csrfToken: string; editable: boolean; onSaved: () => Promise<void>;
}) {
  const [after, setAfter] = useState(0); const [previous, setPrevious] = useState<number[]>([]);
  const [page, setPage] = useState<Page | null>(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError(""); } });
    fetch(`/api/v1/imports/${jobId}/relationships?baseVersion=${version}&after=${after}`, { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const envelope: unknown = await response.json();
        if (!response.ok) throw new Error(response.status === 409 ? "Bản nhập đã đổi. Hãy tải lại trạng thái trước khi rà soát quan hệ." : "Không tải được các quan hệ nguồn được cấp quyền.");
        if (!envelope || typeof envelope !== "object" || !("data" in envelope)) throw new Error("Phản hồi quan hệ không hợp lệ.");
        const result = importRelationshipRowsPageSchema.parse(envelope.data);
        if (result.jobId !== jobId || result.version !== version) throw new Error("Phiên bản trang quan hệ không khớp bản nhập.");
        if (!abort.signal.aborted) setPage(result);
      }).catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được quan hệ nguồn."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [jobId, version, after, retry]);
  return <section className="import-row-inspector" aria-labelledby="import-relationships-title">
    <h3 id="import-relationships-title">Đối chiếu gia đình và quan hệ rõ ràng</h3>
    <p className="muted">Thành viên gia đình và quan hệ cha/mẹ là hai quyết định riêng. Chưa có thao tác nào ghi vào cây gia phả khi chỉ lưu mapping.</p>
    {loading ? <p role="status">Đang tải quan hệ nguồn…</p> : error ? <div><p role="alert">{error}</p><button className="button-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Tải lại quan hệ</button></div> : <>
      {page?.families.length === 0 ? <p>Không có dòng gia đình GEDCOM trong trang này.</p> : <div className="import-row-list">{page?.families.map((family) => <FamilyCard key={`${jobId}:${family.rowNumber}:${version}`} family={family}
        jobId={jobId} version={version} snapshotHash={snapshotHash} csrfToken={csrfToken} editable={editable} onSaved={onSaved} />)}</div>}
      <nav aria-label="Trang gia đình nguồn" className="import-row-pagination">
        <button className="button-secondary" type="button" disabled={!previous.length} onClick={() => { setAfter(previous.at(-1) ?? 0); setPrevious(previous.slice(0, -1)); }}>Trang trước</button>
        <button className="button-secondary" type="button" disabled={page?.nextCursor == null} onClick={() => { if (page?.nextCursor != null) { setPrevious([...previous, after]); setAfter(page.nextCursor); } }}>Gia đình tiếp theo</button>
      </nav>
    </>}
  </section>;
}
