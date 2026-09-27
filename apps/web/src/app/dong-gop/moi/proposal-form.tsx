"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type ProposalContext = { treeId: string; treeName: string; branchId: string | null; branchName: string | null };
type ApiPayload = { data?: unknown; error?: { message?: string } };

type ProposalKind = "correction" | "addition" | "relationship";
const kindLabels: Record<ProposalKind, string> = {
  correction: "Sửa thông tin một người",
  addition: "Bổ sung một người",
  relationship: "Bổ sung quan hệ cha/mẹ - con"
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readApi(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = (await response.json()) as ApiPayload;
  return { response, payload };
}

function parseSourceIds(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function ProposalForm() {
  const router = useRouter();
  const [contexts, setContexts] = useState<ProposalContext[]>([]);
  const [kind, setKind] = useState<ProposalKind>("correction");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void readApi("/api/v1/proposals/context")
      .then(({ response, payload }) => {
        if (!active) return;
        if (response.status === 401) {
          setError("Bạn cần đăng nhập bằng tài khoản thành viên để gửi đề nghị.");
          return;
        }
        if (!response.ok || !Array.isArray(payload.data)) throw new Error("Không thể tải phạm vi đóng góp.");
        setContexts(payload.data as ProposalContext[]);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Không thể tải phạm vi đóng góp.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contextIndex = Number(form.get("contextIndex") ?? 0);
    const context = contexts[contextIndex];
    const reason = String(form.get("reason") ?? "").trim();
    const sourceIds = parseSourceIds(String(form.get("sourceIds") ?? ""));
    setError("");
    if (!context) { setError("Chưa có phạm vi gia phả được cấp quyền đóng góp."); return; }
    if (!reason) { setError("Vui lòng nêu lý do để người duyệt có đủ ngữ cảnh."); return; }
    if (sourceIds.length === 0 || sourceIds.some((id) => !uuidPattern.test(id))) {
      setError("Mỗi đề nghị cần ít nhất một mã nguồn UUID hợp lệ, phân tách bằng dấu phẩy.");
      return;
    }

    let item: Record<string, unknown>;
    let baseSnapshot: Record<string, unknown> | null = null;
    if (kind === "correction") {
      const targetId = String(form.get("targetId") ?? "").trim();
      const baseVersion = Number(form.get("baseVersion") ?? 0);
      const displayName = String(form.get("displayName") ?? "").trim();
      if (!uuidPattern.test(targetId) || !Number.isSafeInteger(baseVersion) || baseVersion < 1 || !displayName) {
        setError("Sửa thông tin cần mã người, phiên bản hiện tại và tên đề xuất hợp lệ."); return;
      }
      item = { targetKind: "person", targetId, baseVersion, operation: "update", fieldChanges: { display_name: displayName }, sourceIds };
    } else if (kind === "addition") {
      const displayName = String(form.get("displayName") ?? "").trim();
      if (!displayName) { setError("Vui lòng nhập tên người cần bổ sung."); return; }
      item = { targetKind: "person", targetId: null, baseVersion: null, operation: "create", fieldChanges: { display_name: displayName, life_status: String(form.get("lifeStatus") ?? "unknown"), visibility: "restricted", protected_minor: false, confidence: "unverified" }, sourceIds };
    } else {
      const parentId = String(form.get("parentId") ?? "").trim();
      const childId = String(form.get("childId") ?? "").trim();
      if (!uuidPattern.test(parentId) || !uuidPattern.test(childId) || parentId === childId) { setError("Quan hệ cần hai mã người khác nhau và hợp lệ."); return; }
      item = { targetKind: "parent_link", targetId: null, baseVersion: null, operation: "create", fieldChanges: { parent_id: parentId, child_id: childId, kind: String(form.get("relationshipKind") ?? "biological"), status: "confirmed", source_id: sourceIds[0] }, sourceIds };
    }
    setPending(true);
    try {
      if (kind === "correction") {
        const targetId = String(form.get("targetId") ?? "").trim();
        const baseVersion = Number(form.get("baseVersion") ?? 0);
        const currentResult = await readApi(`/api/v1/people/${encodeURIComponent(targetId)}`);
        if (!currentResult.response.ok || !currentResult.payload.data || typeof currentResult.payload.data !== "object") throw new Error("Không thể đọc phiên bản hiện tại của hồ sơ để tạo diff.");
        const current = currentResult.payload.data as Record<string, unknown>;
        if (current.version !== baseVersion) throw new Error("Hồ sơ đã thay đổi. Hãy tải lại phiên bản hiện tại trước khi gửi.");
        baseSnapshot = { person: { version: current.version, display_name: current.displayName, recorded_sex: current.recordedSex, life_status: current.lifeStatus, visibility: current.visibility, protected_minor: current.protectedMinor, primary_branch_id: current.primaryBranchId, biography: current.biography ?? null, confidence: current.confidence } };
      }
      const result = await readApi("/api/v1/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ treeId: context.treeId, kind, reason, branchId: context.branchId, baseSnapshot, items: [item] })
      });
      if (!result.response.ok || !result.payload.data || typeof result.payload.data !== "object") throw new Error(result.payload.error?.message ?? "Đề nghị chưa được tiếp nhận.");
      const proposalId = (result.payload.data as { id?: unknown }).id;
      if (typeof proposalId !== "string") throw new Error("Phản hồi đề nghị không hợp lệ.");
      router.push(`/dong-gop/${proposalId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi đề nghị. Vui lòng thử lại.");
    } finally { setPending(false); }
  }

  if (loading) return <div className="proposal-state" role="status">Đang kiểm tra phạm vi đóng góp…</div>;
  if (error && contexts.length === 0) return <div className="card proposal-state"><strong>{error}</strong><p>Đề nghị chỉ dành cho tài khoản thành viên có quyền đóng góp.</p><Link className="button-secondary" href="/dang-nhap">Đăng nhập</Link></div>;

  return (
    <form className="card proposal-form" onSubmit={submit}>
      <div className="proposal-notice"><strong>Đề nghị có nguồn</strong><span>Chưa duyệt không làm thay đổi dữ liệu chính thức. Không nhập thông tin nhạy cảm không cần thiết.</span></div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <label>Phạm vi gia phả<select name="contextIndex" defaultValue="0">{contexts.map((item, index) => <option value={index} key={`${item.treeId}:${item.branchId ?? "tree"}`}>{item.treeName}{item.branchName ? ` · ${item.branchName}` : " · toàn cây"}</option>)}</select></label>
      <label>Loại đề nghị<select value={kind} onChange={(event) => setKind(event.target.value as ProposalKind)}>{(Object.keys(kindLabels) as ProposalKind[]).map((value) => <option value={value} key={value}>{kindLabels[value]}</option>)}</select></label>
      {kind === "correction" ? <>
        <label>Mã người cần sửa<input name="targetId" placeholder="UUID của hồ sơ người" required /></label>
        <label>Phiên bản hiện tại<input name="baseVersion" type="number" min="1" inputMode="numeric" placeholder="Ví dụ: 3" required /></label>
        <label>Tên đề xuất<input name="displayName" maxLength={500} placeholder="Tên sẽ hiển thị sau khi duyệt" required /></label>
      </> : null}
      {kind === "addition" ? <>
        <label>Tên người cần bổ sung<input name="displayName" maxLength={500} placeholder="Tên theo nguồn" required /></label>
        <label>Tình trạng<select name="lifeStatus" defaultValue="unknown"><option value="unknown">Chưa xác định</option><option value="deceased">Đã mất</option><option value="living">Còn sống</option></select></label>
      </> : null}
      {kind === "relationship" ? <>
        <label>Mã người cha/mẹ<input name="parentId" placeholder="UUID hồ sơ cha/mẹ" required /></label>
        <label>Mã người con<input name="childId" placeholder="UUID hồ sơ con" required /></label>
        <label>Loại quan hệ<select name="relationshipKind" defaultValue="biological"><option value="biological">Sinh học</option><option value="adoptive">Nuôi</option><option value="guardian">Giám hộ</option><option value="step">Kế</option></select></label>
      </> : null}
      <label>Nguồn tham chiếu (bắt buộc)<textarea name="sourceIds" rows={3} placeholder="Mã nguồn UUID, phân tách bằng dấu phẩy" required /></label>
      <label>Lý do và ngữ cảnh<textarea name="reason" rows={5} minLength={1} maxLength={4000} placeholder="Mô tả điều cần bổ sung và căn cứ nguồn" required /></label>
      <div className="proposal-actions"><button className="button-primary" type="submit" disabled={pending}>{pending ? "Đang gửi…" : "Gửi đề nghị"}</button><Link className="button-secondary" href="/them">Hủy</Link></div>
    </form>
  );
}