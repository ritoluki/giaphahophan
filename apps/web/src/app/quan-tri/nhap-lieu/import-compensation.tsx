"use client";

import { FormEvent, useRef, useState } from "react";
import { importReviewStateSchema, type ImportReviewState } from "@phan/contracts";

export function ImportCompensation({ state, csrfToken, onChanged }: {
  state: ImportReviewState; csrfToken: string; onChanged: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const review = state.compensation;
  if (state.appliedPeople === 0 && !review) return null;

  async function act(action: "request" | "approve" | "commit", event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const body = action === "request" ? { action, baseVersion: state.job.version, reason: reason.trim() }
      : { action, baseVersion: state.job.version, reviewId: review?.id, reviewVersion: review?.version };
    const signature = JSON.stringify(body);
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/v1/imports/${state.job.id}/compensation`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": retry.current.key, "X-CSRF-Token": csrfToken },
        body: JSON.stringify(body),
      });
      const envelope: unknown = await response.json();
      const data = envelope && typeof envelope === "object" && "data" in envelope ? envelope.data : null;
      if (!response.ok) throw new Error(data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : "Chưa thể hoàn tác; phần đã nhập vẫn được giữ.");
      importReviewStateSchema.parse(data);
      await onChanged(); setReason("");
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Chưa thể hoàn tác; bạn có thể thử lại an toàn."); }
    finally { setPending(false); }
  }

  return <section className="import-row-decision" aria-label="Hoàn tác bản nhập">
    <h3>Hoàn tác phần đã nhập</h3>
    <p className="muted">Cần người khác duyệt yêu cầu này trước khi thực hiện. Chỉ gỡ hồ sơ và quan hệ do bản nhập tạo, khi chưa được sửa hoặc thêm liên kết. Tư liệu gốc và lịch sử nhập vẫn được giữ.</p>
    {!state.canRequestCompensation && !review && <p>Chưa thể đề nghị hoàn tác. Kiểm tra xác thực hai bước và quyền nhập liệu.</p>}
    {state.canRequestCompensation && (!review || review.baseJobVersion !== state.job.version) && <form onSubmit={(event) => void act("request", event)}>
      <label htmlFor="import-compensation-reason">Lý do đề nghị hoàn tác</label>
      <textarea id="import-compensation-reason" required minLength={5} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
      <button className="button-secondary" disabled={pending || reason.trim().length < 5}>Gửi đề nghị hoàn tác</button>
    </form>}
    {review && <div>
      <p>Yêu cầu: {review.status === "completed" ? "Đã hoàn tác" : review.status === "approved" ? "Đã được người khác duyệt" : "Chờ người khác duyệt"}.</p>
      <p>Lý do: {review.reason}</p>
      <p>Phạm vi: {review.counts.people} hồ sơ, {review.counts.unions} gia đình, {review.counts.parentLinks} quan hệ,
        {" "}{review.counts.facts} thông tin ngày tháng và {review.counts.citations} trích dẫn.</p>
      {review.baseJobVersion !== state.job.version && review.status !== "completed" && <p role="status">Bản nhập đã thay đổi; cần tạo yêu cầu mới.</p>}
      {review.canApprove && <button className="button-secondary" disabled={pending} onClick={() => void act("approve")}>Duyệt yêu cầu hoàn tác</button>}
      {review.canCommit && <button className="button-secondary" disabled={pending} onClick={() => void act("commit")}>Thực hiện hoàn tác đã duyệt</button>}
    </div>}
    {pending && <p role="status">Đang xử lý yêu cầu hoàn tác…</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
  </section>;
}
