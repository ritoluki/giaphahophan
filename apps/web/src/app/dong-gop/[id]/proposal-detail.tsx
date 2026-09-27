"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProposalItem = { id: string; targetKind: string; targetId: string | null; baseVersion: number | null; operation: string; fieldChanges: Record<string, unknown>; sourceIds: string[] };
type DiffItem = { itemId: string; targetKind: string; base: Record<string, unknown> | null; current: Record<string, unknown> | null; proposed: { baseVersion: number | null; changes: Record<string, unknown> }; isStale: boolean };
type Proposal = { id: string; trackingCode: string; treeId: string; version: number; createdAt: string; updatedAt: string; status: "draft" | "submitted" | "needs_info" | "approved" | "rejected" | "withdrawn"; kind: string; reason: string; branchId: string | null; submittedBy: string | null; items: ProposalItem[] };
type HistoryEntry = { id: string; kind: "review" | "event"; status: "drafted" | "submitted" | "needs_info" | "approved" | "rejected" | "withdrawn"; decision: "approve" | "reject" | "needs_info" | null; reason: string; createdAt: string };
type ApiPayload = { data?: unknown; error?: { message?: string } };

const statusLabels: Record<Proposal["status"], string> = { draft: "Bản nháp", submitted: "Đã gửi", needs_info: "Cần bổ sung", approved: "Đã duyệt", rejected: "Đã từ chối", withdrawn: "Đã rút" };
const historyStatusLabels: Record<HistoryEntry["status"], string> = { drafted: "Đã lưu nháp", submitted: "Đã gửi", needs_info: "Cần bổ sung", approved: "Đã duyệt", rejected: "Đã từ chối", withdrawn: "Đã rút" };
const kindLabels: Record<string, string> = { correction: "Sửa thông tin", addition: "Bổ sung người", relationship: "Bổ sung quan hệ", merge: "Hợp nhất", publication: "Đề nghị công khai" };

function formatDiff(value: Record<string, unknown> | null) {
  if (!value) return "Chưa có projection";
  return Object.entries(value).map(([key, entry]) => key + ": " + (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n");
}

export function ProposalDetail({ id }: { id: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [diff, setDiff] = useState<DiffItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "restricted">("loading");
  const [message, setMessage] = useState("");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [pendingAction, setPendingAction] = useState<"submit" | "withdraw" | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const loadProposal = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      const [proposalResponse, diffResponse, historyResponse] = await Promise.all([
        fetch("/api/v1/proposals/" + encodeURIComponent(id), { cache: "no-store" }),
        fetch("/api/v1/proposals/" + encodeURIComponent(id) + "/diff", { cache: "no-store" }),
        fetch("/api/v1/proposals/" + encodeURIComponent(id) + "/history", { cache: "no-store" })
      ]);
      const proposalPayload = (await proposalResponse.json()) as ApiPayload;
      const diffPayload = (await diffResponse.json()) as ApiPayload;
      const historyPayload = (await historyResponse.json()) as ApiPayload;
      const proposalData = proposalPayload.data as Proposal | undefined;
      const diffData = diffPayload.data as { proposalId: string; items: DiffItem[] } | undefined;
      const historyData = historyPayload.data as { proposalId: string; entries: HistoryEntry[] } | undefined;
      if ([proposalResponse.status, diffResponse.status].some((status) => status === 401 || status === 403 || status === 404)) {
        setState("restricted");
        return;
      }
      if (!proposalResponse.ok || !proposalData || typeof proposalData !== "object" || !("trackingCode" in proposalData)) {
        throw new Error(proposalPayload.error?.message ?? "Không thể tải đề nghị.");
      }
      if (!diffResponse.ok || !diffData || typeof diffData !== "object" || !("items" in diffData)) {
        throw new Error("Không thể tải phần so sánh của đề nghị.");
      }
      setProposal(proposalData);
      setDiff(diffData.items);
      setHistory(historyResponse.ok && historyData && Array.isArray(historyData.entries) ? historyData.entries : []);
      setState("ready");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Không thể tải đề nghị.");
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(loadProposal);
  }, [loadProposal]);

  async function runLifecycle(action: "submit" | "withdraw") {
    if (!lifecycleReason.trim()) {
      setActionMessage("Vui lòng nêu lý do cho thao tác này.");
      return;
    }
    setPendingAction(action);
    setActionMessage("");
    try {
      const response = await fetch("/api/v1/proposals/" + encodeURIComponent(id) + "/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ reason: lifecycleReason.trim() })
      });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok) throw new Error(payload.error?.message ?? "Thao tác vòng đời chưa được chấp nhận.");
      setLifecycleReason("");
      await loadProposal();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "Không thể cập nhật vòng đời đề nghị.");
    } finally {
      setPendingAction(null);
    }
  }

  if (state === "loading") return <div className="proposal-state" role="status">Đang tải đề nghị…</div>;
  if (state === "restricted") return <div className="card proposal-state"><strong>Không thể hiển thị đề nghị này</strong><p>Đề nghị không tồn tại hoặc tài khoản hiện tại không có quyền xem. Mã UUID không thay thế cho quyền truy cập.</p><Link className="button-secondary" href="/dong-gop/moi">Gửi đề nghị mới</Link></div>;
  if (state === "error" || !proposal) return <div className="card proposal-state"><strong>Đã có lỗi khi tải đề nghị</strong><p>{message}</p><button className="button-secondary" type="button" onClick={() => void loadProposal()}>Thử lại</button></div>;

  const canSubmit = proposal.status === "draft" || proposal.status === "needs_info";
  const canWithdraw = proposal.status === "draft" || proposal.status === "submitted" || proposal.status === "needs_info";

  return <section className="proposal-detail" aria-label="Chi tiết đề nghị">
    <div className="card proposal-tracking-card">
      <div><span className="eyebrow">Mã theo dõi</span><strong className="proposal-tracking-code">{proposal.trackingCode}</strong></div>
      <span className={"status-label proposal-status-" + proposal.status}>{statusLabels[proposal.status]}</span>
      <p className="muted">{kindLabels[proposal.kind] ?? proposal.kind} · Phiên bản đề nghị {proposal.version}</p>
    </div>
    <div className="card proposal-summary"><h2>Lý do gửi</h2><p>{proposal.reason}</p><p className="muted">Cập nhật lần cuối: {new Date(proposal.updatedAt).toLocaleString("vi-VN")}</p></div>
    {(canSubmit || canWithdraw) ? <div className="card proposal-lifecycle"><h2>Thao tác đề nghị</h2><p className="muted">Mỗi thay đổi đều cần lý do và được kiểm tra lại quyền ở máy chủ.</p><label>Lý do thao tác<textarea value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} rows={3} maxLength={4000} placeholder="Ví dụ: Tôi đã bổ sung căn cứ nguồn và muốn gửi lại." /></label>{actionMessage ? <p className="field-error" role="alert">{actionMessage}</p> : null}<div className="proposal-actions">{canSubmit ? <button className="button-primary" type="button" disabled={pendingAction !== null} onClick={() => void runLifecycle("submit")}>{pendingAction === "submit" ? "Đang gửi…" : "Gửi / gửi lại"}</button> : null}{canWithdraw ? <button className="button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void runLifecycle("withdraw")}>{pendingAction === "withdraw" ? "Đang rút…" : "Rút đề nghị"}</button> : null}</div></div> : null}
    <div className="card proposal-items"><h2>Nội dung đề nghị</h2>{proposal.items.map((item) => <article className="proposal-item" key={item.id}><div className="proposal-item-heading"><strong>{item.targetKind} · {item.operation}</strong>{item.baseVersion ? <span className="muted">Cơ sở v{item.baseVersion}</span> : null}</div><dl className="detail-list">{Object.entries(item.fieldChanges).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl><p className="proposal-source-note"><strong>Nguồn:</strong> {item.sourceIds.length ? item.sourceIds.length + " mã nguồn đã liên kết" : "Chưa có nguồn"}</p></article>)}</div>
    <div className="card proposal-diff"><h2>So sánh phiên bản</h2><p className="muted">Base là phiên bản tại lúc gửi, current là dữ liệu hiện tại, proposed là thay đổi đang chờ duyệt.</p>{diff.map((item) => <article className="proposal-diff-item" key={item.itemId}><div className="proposal-item-heading"><strong>{item.targetKind}</strong>{item.isStale ? <span className="proposal-conflict-label">Đã có xung đột phiên bản</span> : <span className="status-label">Đồng bộ</span>}</div><div className="proposal-diff-grid"><section><h3>Base</h3><pre>{formatDiff(item.base)}</pre></section><section><h3>Current</h3><pre>{formatDiff(item.current)}</pre></section><section><h3>Proposed</h3><pre>{formatDiff(item.proposed.changes)}</pre></section></div>{item.isStale ? <p className="field-error">Dữ liệu hiện tại đã khác phiên bản làm cơ sở. Không được silently overwrite; cần rebase có chủ đích trước khi duyệt.</p> : null}</article>)}</div>
    <div className="card proposal-history"><h2>Lịch sử duyệt</h2>{history.length === 0 ? <p className="muted">Chưa có lịch sử hiển thị.</p> : <ol>{history.map((entry) => <li key={entry.id}><div className="proposal-item-heading"><strong>{historyStatusLabels[entry.status] ?? entry.status}</strong><span className="muted">{new Date(entry.createdAt).toLocaleString("vi-VN")}</span></div><p>{entry.reason}</p>{entry.decision ? <span className="status-label">Quyết định: {entry.decision}</span> : null}</li>)}</ol>}</div>
    <div className="proposal-actions"><Link className="button-primary" href="/dong-gop/moi">Gửi đề nghị khác</Link><Link className="button-secondary" href="/them">Về mục Thêm</Link></div>
  </section>;
}