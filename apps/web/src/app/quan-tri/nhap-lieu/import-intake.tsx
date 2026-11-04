"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { importPreviewSchema, importReviewStateSchema, type ImportPreviewRecord, type ImportReviewState } from "@phan/contracts";
import { ImportRowInspector } from "./import-row-inspector";
import { ImportRelationshipEditor } from "./import-relationship-editor";
import { ImportCompensation } from "./import-compensation";
import { describeImportIssue, importClassificationLabels } from "./import-labels";
import { getUiErrorMessage } from "../../../lib/ui-error";

type Envelope<T> = { data?: T; meta?: { requestId?: string; csrfToken?: string } };
type UploadIntent = { assetId: string; uploadUrl: string; requiredHeaders: Record<string, string> };
type ImportTree = { id: string; name: string };
type ImportJob = {
  id: string; version: number; status: string; counters: { processed: number; succeeded: number; failed: number; skipped: number };
  warnings: string[]; fileSha256: string; classification: string;
};

function warningText(warning: string) {
  const labels: Record<string, string> = {
    unknown_tags_preserved_for_review: "Có thẻ GEDCOM chưa hỗ trợ; nội dung nguồn được giữ để rà soát.",
    known_but_unmapped_structures_preserved_for_review: "Một số cấu trúc chưa chuyển thành hồ sơ; chúng vẫn được giữ trong tư liệu gốc.",
    lunar_calendar_sidecar_not_present: "Tệp không chứa thông tin lịch âm bổ sung.",
    "privacy_defaults_to_restricted; no GEDCOM note or media path is published": "Hồ sơ mặc định riêng tư; ghi chú và đường dẫn ảnh trong tệp không được công khai.",
    relationship_mapping_requires_review: "Quan hệ gia đình cần được đối chiếu trước khi áp dụng.",
    unresolved_relationship_references_require_review: "Có mã quan hệ chưa tìm thấy trong tệp; cần đối chiếu nguồn.",
    duplicate_external_ids_require_review: "Mã trong tệp bị lặp; cần rà soát từng dòng.",
    ambiguous_dates_preserved_for_review: "Ngày chưa rõ được giữ nguyên để đối chiếu.",
    unmapped_source_columns_preserved_in_raw_payload: "Cột chưa chọn vẫn được giữ trong nguồn riêng tư.",
    source_schema_version_differs_from_mapping: "Phiên bản tệp khác mẫu đọc đã chọn; cần kiểm tra trước khi duyệt.",
    real_data_owner_approval_required: "Nhập dữ liệu thật cần chủ gia phả phê duyệt riêng.",
  };
  const conformance = [
    ["gedcom_conformance_supported:", "Trường GEDCOM đã nhận diện"],
    ["gedcom_conformance_unsupported:", "Trường GEDCOM còn giữ trong nguồn"],
    ["gedcom_conformance_unknown:", "Thẻ GEDCOM chưa nhận diện"],
  ];
  for (const [prefix, label] of conformance) {
    if (prefix && warning.startsWith(prefix)) return `${label}: ${warning.slice(prefix.length) || "không có"}.`;
  }
  return Object.hasOwn(labels, warning) ? labels[warning]! : "Tệp có thông tin cần đối chiếu thêm với tư liệu gốc.";
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json() as Envelope<T>;
  if (!response.ok) throw body;
  if (body.data === undefined) throw new Error("Máy chủ trả về nội dung không hợp lệ.");
  return body.data;
}

export function ImportIntake() {
  const [treeId, setTreeId] = useState("");
  const [trees, setTrees] = useState<ImportTree[]>([]);
  const [loadingTrees, setLoadingTrees] = useState(true);
  const [sourceNamespace, setSourceNamespace] = useState("family-records");
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"canonical_json" | "structured_json" | "csv" | "gedcom_551" | "gedcom_7">("canonical_json");
  const [externalIdColumn, setExternalIdColumn] = useState("externalId");
  const [displayNameColumn, setDisplayNameColumn] = useState("displayName");
  const [birthDateColumn, setBirthDateColumn] = useState("");
  const [deathDateColumn, setDeathDateColumn] = useState("");
  const [genderColumn, setGenderColumn] = useState("");
  const [notesColumn, setNotesColumn] = useState("");
  const [dateInterpretation, setDateInterpretation] = useState<"explicit_only" | "gregorian_dmy" | "lunar_dmy">("explicit_only");
  const [preview, setPreview] = useState<ImportPreviewRecord | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reviewState, setReviewState] = useState<ImportReviewState | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [reviewAction, setReviewAction] = useState<"approve" | "commit" | "chunks" | "rows" | "cancel" | null>(null);
  const [decisionRow, setDecisionRow] = useState("1");
  const [decisionExcluded, setDecisionExcluded] = useState(true);
  const [decisionReason, setDecisionReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const reviewRequest = useRef<{ signature: string; key: string } | null>(null);

  async function refreshReview(jobId: string) {
    const previewResponse = await fetch(`/api/v1/imports/${jobId}/preview`, { cache: "no-store" });
    setPreview(importPreviewSchema.parse(await responseData<ImportPreviewRecord>(previewResponse)));
    const response = await fetch(`/api/v1/imports/${jobId}`, { cache: "no-store" });
    const envelope = await response.clone().json() as Envelope<ImportReviewState>;
    const result = importReviewStateSchema.parse(await responseData<ImportReviewState>(response));
    setReviewState(result);
    setCsrfToken(envelope.meta?.csrfToken ?? "");
  }

  async function decideRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !reviewState) return;
    const body = { baseVersion: reviewState.job.version, snapshotHash: preview.snapshotHash, rowNumber: Number(decisionRow), excluded: decisionExcluded, reason: decisionReason.trim() };
    const signature = JSON.stringify({ jobId: preview.jobId, action: "rows", body });
    if (reviewRequest.current?.signature !== signature) reviewRequest.current = { signature, key: crypto.randomUUID() };
    setReviewAction("rows"); setError("");
    try {
      const response = await fetch(`/api/v1/imports/${preview.jobId}/rows`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": reviewRequest.current.key, "X-CSRF-Token": csrfToken }, body: JSON.stringify(body),
      });
      setPreview(importPreviewSchema.parse(await responseData<ImportPreviewRecord>(response)));
      await refreshReview(preview.jobId);
      setDecisionReason("");
    } catch (cause: unknown) { setError(getUiErrorMessage(cause, "Chưa cập nhật được dòng. Bạn có thể thử lại.")); }
    finally { setReviewAction(null); }
  }

  async function actOnReview(action: "approve" | "commit" | "chunks") {
    if (!preview || !reviewState) return;
    const body = action === "approve"
      ? { baseVersion: reviewState.job.version, snapshotHash: preview.snapshotHash }
      : { baseVersion: reviewState.job.version, approvedSnapshotHash: reviewState.approvedSnapshotHash, approvalId: reviewState.approvalId,
        ...(action === "chunks" ? { sequence: reviewState.chunkProgress?.nextSequence ?? 1 } : { allowPartial: false }) };
    const signature = JSON.stringify({ jobId: preview.jobId, action, body });
    if (reviewRequest.current?.signature !== signature) reviewRequest.current = { signature, key: crypto.randomUUID() };
    setReviewAction(action); setError("");
    try {
      const response = await fetch(`/api/v1/imports/${preview.jobId}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": reviewRequest.current.key, "X-CSRF-Token": csrfToken },
        body: JSON.stringify(body),
      });
      await responseData<unknown>(response);
      await refreshReview(preview.jobId);
    } catch (cause: unknown) {
      setError(getUiErrorMessage(cause, "Thao tác chưa hoàn tất. Bạn có thể thử lại."));
    } finally { setReviewAction(null); }
  }

  async function cancelImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !reviewState) return;
    const body = { baseVersion: reviewState.job.version, reason: cancelReason.trim() };
    const signature = JSON.stringify({ jobId: preview.jobId, action: "cancel", body });
    if (reviewRequest.current?.signature !== signature) reviewRequest.current = { signature, key: crypto.randomUUID() };
    setReviewAction("cancel"); setError("");
    try {
      const response = await fetch(`/api/v1/imports/${preview.jobId}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": reviewRequest.current.key, "X-CSRF-Token": csrfToken },
        body: JSON.stringify(body),
      });
      await responseData<unknown>(response);
      await refreshReview(preview.jobId);
      setCancelReason("");
    } catch (cause: unknown) { setError(getUiErrorMessage(cause, "Chưa thể hủy bản nhập. Hãy tải lại trạng thái rồi thử lại.")); }
    finally { setReviewAction(null); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/v1/imports", { cache: "no-store" }).then(async (response) => responseData<ImportTree[]>(response))
      .then((items) => { if (active) { setTrees(items); setTreeId(items[0]?.id ?? ""); } })
      .catch((cause: unknown) => { if (active) setError(getUiErrorMessage(cause, "Chưa tải được danh sách gia phả được cấp quyền nhập liệu.")); })
      .finally(() => { if (active) setLoadingTrees(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) return;
    let active = true;
    queueMicrotask(() => { if (active) setLoadingPreview(true); });
    fetch(`/api/v1/imports/${jobId}/preview`, { cache: "no-store" })
      .then((response) => responseData<ImportPreviewRecord>(response))
      .then(async (result) => {
        if (!active) return;
        setPreview(result);
        const response = await fetch(`/api/v1/imports/${jobId}`, { cache: "no-store" });
        const envelope = await response.clone().json() as Envelope<ImportReviewState>;
        const saved = importReviewStateSchema.parse(await responseData<ImportReviewState>(response));
        if (active) { setReviewState(saved); setCsrfToken(envelope.meta?.csrfToken ?? ""); }
      })
      .catch((cause: unknown) => { if (active) setError(getUiErrorMessage(cause, "Chưa tải được kết quả kiểm tra đã lưu.")); })
      .finally(() => { if (active) setLoadingPreview(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError("Vui lòng chọn tệp nguồn."); return; }
    setPending(true); setError(""); setPreview(null); setReviewState(null);
    try {
      const tree = treeId.trim();
      if (!trees.some((item) => item.id === tree)) throw new Error("Vui lòng chọn cây gia phả có quyền nhập liệu.");
      if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error("Tệp nguồn phải nhỏ hơn hoặc bằng 10 MiB.");
      if ((format === "csv" || format === "structured_json") && (!externalIdColumn.trim() || !displayNameColumn.trim() || externalIdColumn.trim() === displayNameColumn.trim())) throw new Error("Cột mã nguồn và cột họ tên phải khác nhau.");
      const mappingVersion = format === "csv" ? "structured-csv/1" : format === "structured_json" ? "structured-json/1" : format.startsWith("gedcom") ? "gedcom-subset/1" : "canonical-json/1";
      const mapping = format === "csv" || format === "structured_json" ? (() => {
        const columns: Record<string, "externalId" | "displayName" | "birthDate" | "deathDate" | "gender" | "notes"> = {
          [externalIdColumn.trim()]: "externalId",
          [displayNameColumn.trim()]: "displayName",
        };
        const optionalColumns = [
          [birthDateColumn, "birthDate"], [deathDateColumn, "deathDate"],
          [genderColumn, "gender"], [notesColumn, "notes"],
        ] as const;
        for (const [headerValue, target] of optionalColumns) {
          const header = headerValue.trim();
          if (!header) continue;
          if (columns[header]) throw new Error("Mỗi trường chỉ được ánh xạ từ một cột riêng biệt.");
          columns[header] = target;
        }
        return {
          mappingVersion: format === "csv" ? "structured-csv/1" : "structured-json/1",
          sourceNamespace: sourceNamespace.trim(), dateInterpretation, columns,
        };
      })() : undefined;
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const mimeType = format === "csv" ? "text/csv" : format.startsWith("gedcom") ? "text/plain" : "application/json";
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
        body: JSON.stringify({ treeId: tree, assetId: intent.assetId, format: format === "csv" ? "csv" : format === "gedcom_551" || format === "gedcom_7" ? format : "canonical_json", sourceNamespace: sourceNamespace.trim(), mappingVersion, ...(mapping ? { mapping } : {}), mode: "demo" })
      });
      const job = await responseData<ImportJob>(importResponse);
      const savedPreview = await fetch(`/api/v1/imports/${job.id}/preview`, { cache: "no-store" });
      const parsedPreview = await responseData<ImportPreviewRecord>(savedPreview);
      window.history.replaceState(null, "", `${window.location.pathname}?job=${job.id}`);
      setPreview(parsedPreview);
      await refreshReview(job.id);
    } catch (cause) {
      setError(getUiErrorMessage(cause, "Chưa thể nhận tệp lúc này. Vui lòng thử lại."));
    } finally { setPending(false); }
  }

  return (
    <section className="import-workspace" aria-labelledby="import-step-title">
      <p className="muted">Tải tệp → Kiểm tra → Đối chiếu và duyệt</p>
      <form className="card import-form" onSubmit={submit}>
        <h2 id="import-step-title">Chọn tệp gia phả</h2>
        <p className="muted">Kết quả kiểm tra được lưu để bạn và người duyệt cùng xem. Thông tin chưa rõ được giữ nguyên để đối chiếu.</p>
        <label htmlFor="import-format">Định dạng</label>
        <select id="import-format" value={format} onChange={(event) => { setFormat(event.target.value as typeof format); setFile(null); }}><option value="canonical_json">JSON theo mẫu gia phả</option><option value="structured_json">JSON — chọn cột thông tin</option><option value="csv">CSV — chọn cột thông tin</option><option value="gedcom_551">GEDCOM 5.5.1 — các trường được hỗ trợ</option><option value="gedcom_7">GEDCOM 7 — các trường được hỗ trợ</option></select>
        {format.startsWith("gedcom") && <p className="muted">Tệp GEDCOM cần dùng bảng mã UTF-8. Những trường và cách ghi lịch chưa được hỗ trợ sẽ được giữ trong tư liệu gốc để đối chiếu.</p>}
        <label htmlFor="import-tree">Gia phả cần nhập</label>
        <select id="import-tree" required value={treeId} disabled={loadingTrees || trees.length === 0} onChange={(event) => setTreeId(event.target.value)}>
          {loadingTrees && <option value="">Đang tải danh sách…</option>}
          {!loadingTrees && trees.length === 0 && <option value="">Chưa có gia phả được cấp quyền</option>}
          {trees.map((tree) => <option key={tree.id} value={tree.id}>{tree.name}</option>)}
        </select>
        <label htmlFor="import-source">Mã bộ tư liệu</label>
        <input id="import-source" required maxLength={200} aria-describedby="import-source-help" value={sourceNamespace} onChange={(event) => setSourceNamespace(event.target.value)} />
        <p id="import-source-help" className="muted">Dùng cùng mã cho các tệp thuộc một bộ tư liệu để giữ đúng mã người trong nguồn.</p>
        <label htmlFor="import-file">Tệp {format === "csv" ? "CSV" : format.startsWith("gedcom") ? "GEDCOM" : "JSON"} · tối đa 10 MiB</label>
        <input id="import-file" type="file" accept={format === "csv" ? "text/csv,.csv" : format.startsWith("gedcom") ? ".ged,.gedcom,text/plain" : "application/json,.json"} required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        {(format === "csv" || format === "structured_json") && <fieldset className="import-mapping-fields"><legend>Chọn cột thông tin trong tệp</legend>
          <p>Nhập đúng tiêu đề cột đang có trong tệp nguồn.</p>
          <label htmlFor="mapping-external-id">Tiêu đề cột mã nguồn</label><input id="mapping-external-id" required maxLength={100} value={externalIdColumn} onChange={(event) => setExternalIdColumn(event.target.value)} />
          <label htmlFor="mapping-display-name">Tiêu đề cột họ tên</label><input id="mapping-display-name" required maxLength={100} value={displayNameColumn} onChange={(event) => setDisplayNameColumn(event.target.value)} />
          <label htmlFor="mapping-birth-date">Tiêu đề cột ngày sinh (không bắt buộc)</label><input id="mapping-birth-date" maxLength={100} placeholder="Để trống nếu không có cột" value={birthDateColumn} onChange={(event) => setBirthDateColumn(event.target.value)} />
          <label htmlFor="mapping-death-date">Tiêu đề cột ngày mất (không bắt buộc)</label><input id="mapping-death-date" maxLength={100} placeholder="Để trống nếu không có cột" value={deathDateColumn} onChange={(event) => setDeathDateColumn(event.target.value)} />
          <label htmlFor="mapping-gender">Tiêu đề cột giới tính ghi nhận (không bắt buộc)</label><input id="mapping-gender" maxLength={100} placeholder="Để trống nếu không có cột" value={genderColumn} onChange={(event) => setGenderColumn(event.target.value)} />
          <label htmlFor="mapping-notes">Tiêu đề cột ghi chú nguồn (không bắt buộc)</label><input id="mapping-notes" maxLength={100} placeholder="Để trống nếu không có cột" value={notesColumn} onChange={(event) => setNotesColumn(event.target.value)} />
          <label htmlFor="mapping-date-format">Cách đọc ngày tháng</label><select id="mapping-date-format" value={dateInterpretation} onChange={(event) => setDateInterpretation(event.target.value as typeof dateInterpretation)}><option value="explicit_only">Giữ nguyên ngày chưa rõ để đối chiếu</option><option value="gregorian_dmy">Đã xác nhận là ngày/tháng/năm dương lịch</option><option value="lunar_dmy">Âm lịch — giữ thông tin tháng nhuận để đối chiếu</option></select>
        </fieldset>}
        <p className="import-safety-note">Hiện chỉ nhận dữ liệu hư cấu vào gia phả minh họa. Áp dụng hồ sơ cần người khác duyệt và xác thực hai bước. Chưa mở nhập dữ liệu gia đình thật.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button-primary" type="submit" disabled={pending}>{pending ? "Đang tải tệp và kiểm tra…" : "Tải tệp và kiểm tra"}</button>
      </form>
      {(pending || loadingPreview) && <div className="card import-result" role="status" aria-live="polite"><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /><p>{loadingPreview ? "Đang tải kết quả kiểm tra đã lưu…" : "Đang tải và xác minh tệp. Vui lòng giữ trang này mở."}</p></div>}
      {preview && <section className="card import-result" aria-live="polite" aria-labelledby="import-result-title">
        <span className="status-label">{reviewState?.compensation?.status === "completed" ? "Đã hoàn tác bản nhập" : reviewState?.job.status === "completed" ? "Đã áp dụng" : reviewState?.job.status === "cancelled" ? (reviewState.appliedPeople > 0 ? "Đã hủy · giữ phần đã lưu" : "Đã hủy · chưa ghi hồ sơ") : reviewState?.job.status === "partially_applied" ? "Đã áp dụng một phần" : reviewState?.job.status === "ready" ? "Đã duyệt" : "Cần rà soát"}</span>
        <h2 id="import-result-title">Kết quả kiểm tra tệp</h2>
        <dl className="import-counts"><div><dt>Tổng dòng</dt><dd>{preview.valid + preview.invalid + preview.possibleDuplicates + preview.excluded}</dd></div><div><dt>Hợp lệ</dt><dd>{preview.valid}</dd></div><div><dt>Cần sửa</dt><dd>{preview.invalid}</dd></div><div><dt>Cần rà soát</dt><dd>{preview.possibleDuplicates}</dd></div><div><dt>Đã loại trừ</dt><dd>{preview.excluded}</dd></div></dl>
        <p>Loại dữ liệu: {importClassificationLabels[preview.classification]}.</p>
        <details><summary>Mã kiểm tra tệp</summary><p>Mã SHA-256 dùng để đối chiếu đúng tệp đã tải lên.</p><code className="import-hash">{preview.fileSha256}</code></details>
        {preview.warnings.length > 0 && <div><h3>Lưu ý</h3><ul>{preview.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warningText(warning)}</li>)}</ul></div>}
        <div><h3>Xem trước tối đa 50 dòng</h3>{preview.sampleRows.length === 0 ? <p className="muted">Chưa có dòng để xem trước.</p> : <ul className="import-row-list">{preview.sampleRows.map((row) => <li className="import-row-card" key={row.rowNumber}><div className="import-row-heading"><strong>Dòng {row.rowNumber}: {row.displayName}</strong><span className="tag">{row.excluded ? "Đã loại trừ" : row.status === "valid" ? "Hợp lệ" : row.status === "review" ? "Cần rà soát" : "Cần sửa"}</span></div><p>Mã trong nguồn: <code>{row.externalId}</code></p>{row.errors.length > 0 && <ul>{row.errors.map((issue, index) => <li key={`${index}-${issue}`}>{describeImportIssue(issue)}</li>)}</ul>}</li>)}</ul>}</div>
        {reviewState && <ImportRowInspector key={`${preview.jobId}:${reviewState.job.version}`} jobId={preview.jobId} version={reviewState.job.version}
          editable={["needs_review", "ready"].includes(reviewState.job.status) && reviewAction === null} onSelect={(rowNumber, excluded) => {
            setDecisionRow(String(rowNumber)); setDecisionExcluded(!excluded); setDecisionReason("");
            document.getElementById("import-decision-reason")?.focus();
          }} />}
        {reviewState && <ImportRelationshipEditor key={`relationships:${preview.jobId}:${reviewState.job.version}`} jobId={preview.jobId}
          version={reviewState.job.version} snapshotHash={preview.snapshotHash} csrfToken={csrfToken}
          editable={["needs_review", "ready"].includes(reviewState.job.status) && reviewAction === null}
          onSaved={async () => { await refreshReview(preview.jobId); }} />}
        {reviewState && ["needs_review", "ready"].includes(reviewState.job.status) && <form className="import-row-decision" onSubmit={decideRow}>
          <h3>Quyết định từng dòng</h3>
          <p className="muted">Dòng bị loại vẫn còn trong tư liệu gốc và có thể chọn lại. Thay đổi lựa chọn cần duyệt lại bản nhập và xác thực hai bước. Quan hệ chưa rõ cần được đối chiếu riêng.</p>
          <label htmlFor="import-decision-row">Số dòng nguồn</label><input id="import-decision-row" type="number" min="1" max="10000" required value={decisionRow} onChange={(event) => setDecisionRow(event.target.value)} />
          <label htmlFor="import-decision-action">Quyết định</label><select id="import-decision-action" value={decisionExcluded ? "exclude" : "restore"} onChange={(event) => setDecisionExcluded(event.target.value === "exclude")}><option value="exclude">Loại trừ khỏi bản áp dụng</option><option value="restore">Khôi phục vào bản rà soát</option></select>
          <label htmlFor="import-decision-reason">Lý do (bắt buộc)</label><textarea id="import-decision-reason" required maxLength={1000} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} />
          <button className="button-secondary" type="submit" disabled={reviewAction !== null || !decisionReason.trim()}>{reviewAction === "rows" ? "Đang lưu quyết định…" : "Lưu quyết định dòng"}</button>
        </form>}
        {reviewState?.canCancel && <form className="import-row-decision" onSubmit={cancelImport}>
          <h3>{reviewState.appliedPeople > 0 ? "Dừng các lượt nhập còn lại" : "Hủy bản nhập chưa áp dụng"}</h3>
          <p className="muted">{reviewState.appliedPeople > 0 ? "Hủy sẽ ngăn các lượt tiếp theo. Hồ sơ, quan hệ và trích dẫn đã lưu vẫn được giữ trong cây." : "Hủy bản nhập trước khi áp dụng. Nếu một thao tác áp dụng đang chạy, máy chủ kiểm tra trạng thái sau khi thao tác đó kết thúc."}</p>
          <label htmlFor="import-cancel-reason">Lý do hủy</label><textarea id="import-cancel-reason" required minLength={5} maxLength={1000} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          <button className="button-secondary" type="submit" disabled={reviewAction !== null || cancelReason.trim().length < 5}>{reviewAction === "cancel" ? "Đang hủy…" : "Hủy bản nhập"}</button>
        </form>}
        {reviewState?.chunkProgress && <p role="status">Đã lưu {reviewState.chunkProgress.committed}/{reviewState.chunkProgress.total} lượt nhập.</p>}
        {reviewState && reviewState.appliedPeople > 0 && <p className="import-safety-note" role="status">Đã lưu {reviewState.appliedPeople} hồ sơ, {reviewState.appliedUnions} gia đình và {reviewState.appliedParentLinks} quan hệ cha mẹ vào gia phả minh họa cùng tư liệu đối chiếu riêng tư.</p>}
        {reviewState && ["needs_review", "ready", "partially_applied"].includes(reviewState.job.status) && <>
          <p className="import-safety-note">{reviewState.job.status === "partially_applied" ? "Phần đã lưu vẫn tồn tại sau khi tải lại trang hoặc khi lượt sau gặp lỗi. Tiếp tục từ lượt kế tiếp, hoặc hủy để dừng phần còn lại." : "Dòng lỗi và quan hệ chưa đối chiếu cần được xử lý trước khi duyệt. Bản nhập lớn được lưu theo lượt: hồ sơ trước, gia đình và quan hệ sau. Gửi đường dẫn trang này cho người duyệt có quyền nhập liệu."}</p>
          {reviewState?.job.status === "needs_review" && <button className="button-primary" type="button"
            disabled={!reviewState.canReview || preview.invalid > 0 || preview.possibleDuplicates > 0 || preview.valid < 1 || preview.valid > 10000 || reviewAction !== null}
            onClick={() => void actOnReview("approve")}>{reviewAction === "approve" ? "Đang duyệt…" : "Duyệt bản nhập minh họa"}</button>}
          {reviewState.job.status === "ready" && (reviewState.canApply || preview.valid <= 2000) && <button className="button-primary" type="button" disabled={!reviewState.canApply || reviewAction !== null}
            onClick={() => void actOnReview("commit")}>{reviewAction === "commit" ? "Đang lưu hồ sơ…" : "Áp dụng vào gia phả minh họa"}</button>}
          {reviewState.canApplyChunk && <button className="button-secondary" type="button" disabled={reviewAction !== null}
            onClick={() => void actOnReview("chunks")}>{reviewAction === "chunks" ? "Đang lưu lượt nhập…" : reviewState.chunkProgress ? "Lưu lượt nhập tiếp theo" : "Bắt đầu nhập theo lượt"}</button>}
          {!reviewState.canReview && !reviewState.canApply && !reviewState.canApplyChunk && <p className="muted">Cần xác thực hai bước; người tạo không tự duyệt và người duyệt không tự áp dụng bản đã duyệt.</p>}
        </>}
        {reviewState && <ImportCompensation state={reviewState} csrfToken={csrfToken} onChanged={() => refreshReview(preview.jobId)} />}
        <button className="button-secondary" type="button" disabled={reviewAction !== null} onClick={() => {
          setError(""); void refreshReview(preview.jobId).catch((cause: unknown) => setError(getUiErrorMessage(cause, "Chưa tải được trạng thái.")));
        }}>Tải lại trạng thái</button>
      </section>}
    </section>
  );
}
