"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProposalItem = { id: string; targetKind: string; targetId: string | null; baseVersion: number | null; operation: string; fieldChanges: Record<string, unknown>; sourceIds: string[] };
type Proposal = { id: string; trackingCode: string; treeId: string; version: number; createdAt: string; updatedAt: string; status: "draft" | "submitted" | "needs_info" | "approved" | "rejected" | "withdrawn"; kind: string; reason: string; branchId: string | null; submittedBy: string | null; items: ProposalItem[] };
type ApiPayload = { data?: Proposal; error?: { message?: string } };
const statusLabels: Record<Proposal["status"], string> = { draft: "Bản nháp", submitted: "Đã gửi", needs_info: "Cần bổ sung", approved: "Đã duyệt", rejected: "Đã từ chối", withdrawn: "Đã rút" };
const kindLabels: Record<string, string> = { correction: "Sửa thông tin", addition: "Bổ sung người", relationship: "Bổ sung quan hệ", merge: "Hợp nhất", publication: "Đề nghị công khai" };

export function ProposalDetail({ id }: { id: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "restricted">("loading");
  const [message, setMessage] = useState("");


  useEffect(() => {
    let active = true;
    async function fetchProposal() {
      setState("loading"); setMessage("");
      try {
        const response = await fetch(`/api/v1/proposals/${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = (await response.json()) as ApiPayload;
        if (!active) return;
        if (response.status === 401 || response.status === 403 || response.status === 404) { setState("restricted"); return; }
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Không thể tải đề nghị.");
        setProposal(payload.data); setState("ready");
      } catch (cause) {
        if (active) { setMessage(cause instanceof Error ? cause.message : "Không thể tải đề nghị."); setState("error"); }
      }
    }
    void fetchProposal();
    return () => { active = false; };
  }, [id]);
  if (state === "loading") return <div className="proposal-state" role="status">Đang tải đề nghị…</div>;
  if (state === "restricted") return <div className="card proposal-state"><strong>Không thể hiển thị đề nghị này</strong><p>Đề nghị không tồn tại hoặc tài khoản hiện tại không có quyền xem. Mã UUID không thay thế cho quyền truy cập.</p><Link className="button-secondary" href="/dong-gop/moi">Gửi đề nghị mới</Link></div>;
  if (state === "error" || !proposal) return <div className="card proposal-state"><strong>Đã có lỗi khi tải đề nghị</strong><p>{message}</p><button className="button-secondary" type="button" onClick={() => window.location.reload()}>Thử lại</button></div>;

  return <section className="proposal-detail" aria-label="Chi tiết đề nghị">
    <div className="card proposal-tracking-card">
      <div><span className="eyebrow">Mã theo dõi</span><strong className="proposal-tracking-code">{proposal.trackingCode}</strong></div>
      <span className={`status-label proposal-status-${proposal.status}`}>{statusLabels[proposal.status]}</span>
      <p className="muted">{kindLabels[proposal.kind] ?? proposal.kind} · Phiên bản đề nghị {proposal.version}</p>
    </div>
    <div className="card proposal-summary"><h2>Lý do gửi</h2><p>{proposal.reason}</p><p className="muted">Cập nhật lần cuối: {new Date(proposal.updatedAt).toLocaleString("vi-VN")}</p></div>
    <div className="card proposal-items"><h2>Nội dung đề nghị</h2>{proposal.items.map((item) => <article className="proposal-item" key={item.id}><div className="proposal-item-heading"><strong>{item.targetKind} · {item.operation}</strong>{item.baseVersion ? <span className="muted">Cơ sở v{item.baseVersion}</span> : null}</div><dl className="detail-list">{Object.entries(item.fieldChanges).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl><p className="proposal-source-note"><strong>Nguồn:</strong> {item.sourceIds.length ? `${item.sourceIds.length} mã nguồn đã liên kết` : "Chưa có nguồn"}</p></article>)}</div>
    <div className="proposal-actions"><Link className="button-primary" href="/dong-gop/moi">Gửi đề nghị khác</Link><Link className="button-secondary" href="/them">Về mục Thêm</Link></div>
  </section>;
}