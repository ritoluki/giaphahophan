"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { importReviewStateSchema, type ImportPreviewRecord, type ImportReviewState } from "@phan/contracts";

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
    duplicate_external_ids_require_review: "Mã nguồn bị lặp; cần rà soát từng bản ghi.",
    ambiguous_dates_preserved_for_review: "Ngày chưa rõ được giữ nguyên để đối chiếu.",
    unmapped_source_columns_preserved_in_raw_payload: "Cột chưa chọn vẫn được giữ trong nguồn riêng tư.",
    source_schema_version_differs_from_mapping: "Phiên bản tệp khác mapping đã chọn; cần kiểm tra trước khi duyệt.",
  };
  const conformance = [
    ["gedcom_conformance_supported:", "Trường GEDCOM đã nhận diện"],
    ["gedcom_conformance_unsupported:", "Trường GEDCOM còn giữ trong nguồn"],
    ["gedcom_conformance_unknown:", "Thẻ GEDCOM chưa nhận diện"],
  ];
  for (const [prefix, label] of conformance) {
    if (prefix && warning.startsWith(prefix)) return `${label}: ${warning.slice(prefix.length) || "không có"}.`;
  }
  return labels[warning] ?? `Cần đối chiếu nguồn: ${warning}`;
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json() as Envelope<T>;
  if (!response.ok) {
    const detail = body.data && typeof body.data === "object" ? body.data as { message?: unknown } : null;
    const message = typeof detail?.message === "string" ? detail.message : `Yêu cầu chưa hoàn tất (${response.status}).`;
    const requestId = typeof body.meta?.requestId === "string" ? ` Mã yêu cầu: ${body.meta.requestId}.` : "";
    throw new Error(`${message}${requestId}`);
  }
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
  const [reviewAction, setReviewAction] = useState<"approve" | "commit" | null>(null);
  const reviewRequest = useRef<{ signature: string; key: string } | null>(null);

  async function refreshReview(jobId: string) {
    const response = await fetch(`/api/v1/imports/${jobId}`, { cache: "no-store" });
    const envelope = await response.clone().json() as Envelope<ImportReviewState>;
    const result = importReviewStateSchema.parse(await responseData<ImportReviewState>(response));
    setReviewState(result);
    setCsrfToken(envelope.meta?.csrfToken ?? "");
  }

  async function actOnReview(action: "approve" | "commit") {
    if (!preview || !reviewState) return;
    const body = action === "approve"
      ? { baseVersion: reviewState.job.version, snapshotHash: preview.snapshotHash }
      : { baseVersion: reviewState.job.version, approvedSnapshotHash: reviewState.approvedSnapshotHash, approvalId: reviewState.approvalId, allowPartial: false };
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
      setError(cause instanceof Error ? cause.message : "Thao tác chưa hoàn tất. Bạn có thể thử lại bằng cùng mã thao tác.");
    } finally { setReviewAction(null); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/v1/imports", { cache: "no-store" }).then(async (response) => responseData<ImportTree[]>(response))
      .then((items) => { if (active) { setTrees(items); setTreeId(items[0]?.id ?? ""); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Không tải được danh sách cây được cấp quyền nhập liệu."); })
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
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Không thể tải bản dry-run đã lưu."); })
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
      setError(cause instanceof Error ? cause.message : "Không thể tiếp nhận tệp lúc này.");
    } finally { setPending(false); }
  }

  return (
    <section className="import-workspace" aria-labelledby="import-step-title">
      <div className="import-stepper" aria-label="Quy trình tiếp nhận">
        <span aria-current="step"><b>1</b> Tư liệu</span><span><b>2</b> Kiểm tra</span><span><b>3</b> Rà soát</span>
      </div>
      <form className="card import-form" onSubmit={submit}>
        <label htmlFor="import-format">Định dạng</label>
        <select id="import-format" value={format} onChange={(event) => { setFormat(event.target.value as typeof format); setFile(null); }}><option value="canonical_json">JSON canonical</option><option value="structured_json">JSON có mapping</option><option value="csv">CSV có mapping</option><option value="gedcom_551">GEDCOM 5.5.1 (subset)</option><option value="gedcom_7">GEDCOM 7 (subset)</option></select>
        {format.startsWith("gedcom") && <p className="muted">Profile GEDCOM hiện nhận UTF-8 và subset được công bố; tag/lịch không hỗ trợ sẽ được giữ nguyên để rà soát, không tự diễn giải.</p>}
        <h2 id="import-step-title">Bản nhập demo</h2>
        <p className="muted">Nhận JSON canonical, JSON/CSV có mapping hoặc GEDCOM 5.5.1/7 theo subset. Tệp được giữ trong bucket riêng tư; bản gốc không xuất hiện trong phản hồi. Ngày mơ hồ được giữ để rà soát, không tự ép thành ngày chính xác.</p>
        <label htmlFor="import-tree">Cây gia phả được cấp quyền</label>
        <select id="import-tree" required value={treeId} disabled={loadingTrees || trees.length === 0} onChange={(event) => setTreeId(event.target.value)}>
          {loadingTrees && <option value="">Đang tải danh sách…</option>}
          {!loadingTrees && trees.length === 0 && <option value="">Không có cây được cấp quyền</option>}
          {trees.map((tree) => <option key={tree.id} value={tree.id}>{tree.name}</option>)}
        </select>
        <label htmlFor="import-source">Không gian nguồn</label>
        <input id="import-source" required maxLength={200} value={sourceNamespace} onChange={(event) => setSourceNamespace(event.target.value)} />
        <label htmlFor="import-file">Tệp {format === "csv" ? "CSV" : format.startsWith("gedcom") ? "GEDCOM" : "JSON"} · tối đa 10 MiB</label>
        <input id="import-file" type="file" accept={format === "csv" ? "text/csv,.csv" : format.startsWith("gedcom") ? ".ged,.gedcom,text/plain" : "application/json,.json"} required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        {(format === "csv" || format === "structured_json") && <fieldset className="import-mapping-fields"><legend>Mapping {format === "csv" ? "structured-csv/1" : "structured-json/1"}</legend>
          <label htmlFor="mapping-external-id">Tiêu đề cột mã nguồn</label><input id="mapping-external-id" required maxLength={100} value={externalIdColumn} onChange={(event) => setExternalIdColumn(event.target.value)} />
          <label htmlFor="mapping-display-name">Tiêu đề cột họ tên</label><input id="mapping-display-name" required maxLength={100} value={displayNameColumn} onChange={(event) => setDisplayNameColumn(event.target.value)} />
          <label htmlFor="mapping-birth-date">Tiêu đề cột ngày sinh (không bắt buộc)</label><input id="mapping-birth-date" maxLength={100} placeholder="Để trống nếu không có cột" value={birthDateColumn} onChange={(event) => setBirthDateColumn(event.target.value)} />
          <label htmlFor="mapping-death-date">Tiêu đề cột ngày mất (không bắt buộc)</label><input id="mapping-death-date" maxLength={100} placeholder="Để trống nếu không có cột" value={deathDateColumn} onChange={(event) => setDeathDateColumn(event.target.value)} />
          <label htmlFor="mapping-gender">Tiêu đề cột giới tính ghi nhận (không bắt buộc)</label><input id="mapping-gender" maxLength={100} placeholder="Để trống nếu không có cột" value={genderColumn} onChange={(event) => setGenderColumn(event.target.value)} />
          <label htmlFor="mapping-notes">Tiêu đề cột ghi chú nguồn (không bắt buộc)</label><input id="mapping-notes" maxLength={100} placeholder="Để trống nếu không có cột" value={notesColumn} onChange={(event) => setNotesColumn(event.target.value)} />
          <label htmlFor="mapping-date-format">Cách diễn giải ngày mơ hồ</label><select id="mapping-date-format" value={dateInterpretation} onChange={(event) => setDateInterpretation(event.target.value as typeof dateInterpretation)}><option value="explicit_only">Giữ nguyên để rà soát</option><option value="gregorian_dmy">Dương lịch ngày/tháng/năm đã xác nhận</option><option value="lunar_dmy">Âm lịch, không tự suy đoán tháng nhuận</option></select>
        </fieldset>}
        <p className="import-safety-note">Chỉ nhập vào cây demo. Muốn áp dụng hồ sơ cần người khác duyệt và xác thực hai bước. Dữ liệu thật đang bị khóa đến khi có phê duyệt H5.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button-primary" type="submit" disabled={pending}>{pending ? "Đang kiểm tra và tiếp nhận…" : "Tải lên và chạy dry-run"}</button>
      </form>
      {(pending || loadingPreview) && <div className="card import-result" role="status" aria-live="polite"><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /><p>{loadingPreview ? "Đang tải bản dry-run đã lưu…" : "Đang xác minh tệp trong kho riêng. Không đóng trang cho đến khi hoàn tất."}</p></div>}
      {preview && <section className="card import-result" aria-live="polite" aria-labelledby="import-result-title">
        <span className="status-label">{reviewState?.job.status === "completed" ? "Đã áp dụng" : reviewState?.job.status === "ready" ? "Đã duyệt" : "Cần rà soát"}</span>
        <h2 id="import-result-title">Kết quả dry-run</h2>
        <dl className="import-counts"><div><dt>Tổng dòng</dt><dd>{preview.valid + preview.invalid + preview.possibleDuplicates}</dd></div><div><dt>Hợp lệ</dt><dd>{preview.valid}</dd></div><div><dt>Cần sửa</dt><dd>{preview.invalid}</dd></div><div><dt>Cần rà soát</dt><dd>{preview.possibleDuplicates}</dd></div></dl>
        <p>Phân loại: {preview.classification}. Checksum SHA-256: <code className="import-hash">{preview.fileSha256}</code></p>
        {preview.warnings.length > 0 && <div><h3>Lưu ý</h3><ul>{preview.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warningText(warning)}</li>)}</ul></div>}
        <div><h3>Dòng mẫu · tối đa 50</h3>{preview.sampleRows.length === 0 ? <p className="muted">Chưa có dòng để xem trước.</p> : <ul className="import-row-list">{preview.sampleRows.map((row) => <li className="import-row-card" key={row.rowNumber}><div className="import-row-heading"><strong>Dòng {row.rowNumber}: {row.displayName}</strong><span className="tag">{row.status === "valid" ? "Hợp lệ" : row.status === "review" ? "Cần rà soát" : "Cần sửa"}</span></div><p>Mã nguồn: <code>{row.externalId}</code></p>{row.errors.length > 0 && <ul>{row.errors.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}</li>)}</ul>}</div>
        {reviewState?.job.status === "completed" ? <p className="import-safety-note" role="status">Đã lưu {reviewState.appliedPeople} hồ sơ vào cây demo cùng nguồn trích dẫn riêng tư.</p> : <>
          <p className="import-safety-note">Chưa ghi hồ sơ. Batch có lỗi, dòng cần rà soát, quan hệ gia đình hoặc hơn 2.000 người cần được xử lý trước bước áp dụng. Gửi đường dẫn trang này cho người duyệt có quyền nhập liệu.</p>
          {reviewState?.job.status === "needs_review" && <button className="button-primary" type="button"
            disabled={!reviewState.canReview || preview.invalid > 0 || preview.possibleDuplicates > 0 || preview.valid < 1 || preview.valid > 2000 || reviewAction !== null}
            onClick={() => void actOnReview("approve")}>{reviewAction === "approve" ? "Đang duyệt…" : "Duyệt bản nhập demo"}</button>}
          {reviewState?.job.status === "ready" && <button className="button-primary" type="button" disabled={!reviewState.canApply || reviewAction !== null}
            onClick={() => void actOnReview("commit")}>{reviewAction === "commit" ? "Đang lưu hồ sơ…" : "Áp dụng vào cây demo"}</button>}
          {reviewState && !reviewState.canReview && !reviewState.canApply && <p className="muted">Cần xác thực hai bước; người tạo không tự duyệt và người duyệt không tự áp dụng bản đã duyệt.</p>}
        </>}
        <button className="button-secondary" type="button" disabled={reviewAction !== null} onClick={() => {
          setError(""); void refreshReview(preview.jobId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Không tải được trạng thái."));
        }}>Tải lại trạng thái</button>
      </section>}
    </section>
  );
}
