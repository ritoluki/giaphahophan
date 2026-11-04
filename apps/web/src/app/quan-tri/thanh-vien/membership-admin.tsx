"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getUiErrorMessage } from "../../../lib/ui-error";

type Grant = {
  id: string;
  version: number;
  capability: string;
  branchId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

type Membership = {
  id: string;
  version: number;
  displayName: string;
  role: "owner" | "admin" | "reviewer" | "editor" | "member";
  status: "pending" | "active" | "suspended" | "revoked";
  personId: string | null;
  mfaEnrolled: boolean;
  grants: Grant[];
};

type ApiPayload = {
  data?: Membership[] | Membership | { code?: string; message?: string };
  error?: { message?: string };
};

const capabilities = [
  "treasury.write",
  "treasury.approve",
  "scholarship.review",
  "privacy.manage",
  "exports.bulk",
  "publication.manage",
  "operations.read",
  "imports.manage"
] as const;

const roleLabels: Record<Membership["role"], string> = { owner: "Chủ gia phả", admin: "Quản trị viên", reviewer: "Người duyệt", editor: "Người biên soạn", member: "Thành viên" };
const statusLabels: Record<Membership["status"], string> = { pending: "Chờ xác nhận", active: "Đang hoạt động", suspended: "Tạm ngưng", revoked: "Đã thu hồi" };
const capabilityLabels: Record<(typeof capabilities)[number], string> = {
  "treasury.write": "Lập khoản thu chi", "treasury.approve": "Duyệt khoản thu chi", "scholarship.review": "Duyệt khuyến học",
  "privacy.manage": "Quản lý quyền riêng tư", "exports.bulk": "Xuất gia phả hàng loạt", "publication.manage": "Quản lý xuất bản",
  "operations.read": "Xem thông tin vận hành", "imports.manage": "Quản lý nhập gia phả",
};
function capabilityLabel(value: string) { return Object.hasOwn(capabilityLabels, value) ? capabilityLabels[value as keyof typeof capabilityLabels] : "Quyền bổ sung"; }

async function readApi(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = (await response.json()) as ApiPayload;
  return { response, payload };
}

export function MembershipAdmin() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [grantCapability, setGrantCapability] = useState<Record<string, string>>({});
  const [restricted, setRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const result = await readApi("/api/v1/members");
      if (result.response.status === 401 || result.response.status === 403) {
        setRestricted(true);
        setMemberships([]);
        return;
      }
      if (!result.response.ok || !Array.isArray(result.payload.data)) throw new Error("Không thể tải danh sách thành viên.");
      setRestricted(false);
      setMemberships(result.payload.data);
    } catch (cause) {
      setError(getUiErrorMessage(cause, "Không thể tải danh sách thành viên. Vui lòng thử lại."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // The request is the external synchronization this effect owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMembers();
  }, []);

  const visibleMembers = useMemo(() => {
    const normalized = filter.trim().toLocaleLowerCase("vi-VN");
    return memberships.filter((member) => {
      const matchesText = !normalized || member.displayName.toLocaleLowerCase("vi-VN").includes(normalized) || roleLabels[member.role].toLocaleLowerCase("vi-VN").includes(normalized);
      const matchesStatus = statusFilter === "all" || member.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [filter, memberships, statusFilter]);

  async function updateMember(event: FormEvent<HTMLFormElement>, member: Membership) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get("role") ?? member.role);
    const status = String(form.get("status") ?? member.status);
    const reason = String(form.get("reason") ?? "").trim();
    if (member.role === "owner" || !reason) return;
    setPendingId(member.id);
    setError("");
    setNotice("");
    try {
      const result = await readApi("/api/v1/members/" + member.id, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(member.version),
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ role, status, reason })
      });
      if (!result.response.ok) throw result.payload;
      await loadMembers();
      setNotice("Đã lưu thay đổi thành viên.");
    } catch (cause) {
      setError(getUiErrorMessage(cause, "Chưa lưu được thay đổi thành viên."));
    } finally {
      setPendingId(null);
    }
  }

  async function createGrant(event: FormEvent<HTMLFormElement>, member: Membership) {
    event.preventDefault();
    const capability = grantCapability[member.id] ?? "operations.read";
    setPendingId(member.id);
    setError("");
    setNotice("");
    try {
      const result = await readApi("/api/v1/members/" + member.id + "/grants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ capability, branchId: null, expiresAt: null })
      });
      if (!result.response.ok) throw result.payload;
      await loadMembers();
      setNotice("Đã cấp quyền bổ sung.");
    } catch (cause) {
      setError(getUiErrorMessage(cause, "Chưa cấp được quyền bổ sung."));
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <div className="admin-state" role="status">Đang tải danh sách thành viên…</div>;
  if (restricted) return <div className="restricted-card admin-restricted"><strong>Cần quyền quản lý thành viên</strong><p>Hãy đăng nhập bằng tài khoản chủ gia phả hoặc quản trị viên được cấp quyền.</p></div>;

  return (
    <section className="membership-admin" aria-label="Danh sách thành viên">
      <div className="membership-toolbar">
        <label>Tìm thành viên<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Tên hoặc vai trò" /></label>
        <label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả</option><option value="active">Đang hoạt động</option><option value="suspended">Tạm ngưng</option><option value="revoked">Đã thu hồi</option><option value="pending">Đang chờ</option></select></label>
      </div>
      {error ? <p className="field-error" role="alert">{error} <button className="button-secondary" type="button" onClick={loadMembers}>Thử lại</button></p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {visibleMembers.length === 0 ? <div className="admin-state"><strong>Chưa tìm thấy thành viên</strong><p>Thử tên khác hoặc chọn lại trạng thái.</p></div> : null}
      <div className="membership-list">
        {visibleMembers.map((member) => {
          const locked = member.role === "owner";
          return (
            <article className="card membership-card" key={member.id}>
              <div className="membership-card-head">
                <div><span className="status-label">{roleLabels[member.role]}</span><h2>{member.displayName}</h2><p className="muted">Xác thực hai bước: {member.mfaEnrolled ? "đã thiết lập" : "chưa thiết lập"}</p></div>
                <span className={"membership-status membership-status-" + member.status}>{statusLabels[member.status]}</span>
              </div>
              <div className="membership-grants"><strong>Quyền bổ sung</strong>{member.grants.length ? <ul>{member.grants.map((grant) => <li key={grant.id}>{capabilityLabel(grant.capability)}{grant.branchId ? " · trong chi được giao" : " · toàn gia phả"}</li>)}</ul> : <p className="muted">Chưa có quyền bổ sung.</p>}</div>
              {locked ? <p className="membership-locked">Chuyển quyền chủ gia phả cần cả hai bên xác nhận.</p> : (
                <>
                  <form className="membership-form" onSubmit={(event) => updateMember(event, member)}>
                    <label>Vai trò<select name="role" defaultValue={member.role}><option value="admin">Quản trị viên</option><option value="reviewer">Người duyệt</option><option value="editor">Người biên soạn</option><option value="member">Thành viên</option></select></label>
                    <label>Trạng thái<select name="status" defaultValue={member.status === "pending" ? "" : member.status} required>{member.status === "pending" ? <option value="" disabled>Chọn quyết định cho thành viên đang chờ</option> : null}<option value="active">Đang hoạt động</option><option value="suspended">Tạm ngưng</option><option value="revoked">Thu hồi</option></select></label>
                    <label className="membership-reason">Lý do thay đổi<input name="reason" minLength={5} maxLength={2000} placeholder="Ghi rõ lý do để lưu trong lịch sử" required /></label>
                    <button className="button-primary" type="submit" disabled={pendingId === member.id}>{pendingId === member.id ? "Đang lưu…" : "Lưu thay đổi"}</button>
                  </form>
                  <form className="membership-grant-form" onSubmit={(event) => createGrant(event, member)}>
                    <label>Chọn quyền bổ sung<select value={grantCapability[member.id] ?? "operations.read"} onChange={(event) => setGrantCapability((current) => ({ ...current, [member.id]: event.target.value }))}>{capabilities.map((capability) => <option value={capability} key={capability}>{capabilityLabels[capability]}</option>)}</select></label>
                    <button className="button-secondary" type="submit" disabled={pendingId === member.id}>Cấp quyền</button>
                  </form>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
