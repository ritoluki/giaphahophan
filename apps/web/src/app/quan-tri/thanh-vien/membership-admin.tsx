"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  "operations.read"
] as const;

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
      setError(cause instanceof Error ? cause.message : "Không thể kết nối. Vui lòng thử lại.");
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
      const matchesText = !normalized || member.displayName.toLocaleLowerCase("vi-VN").includes(normalized) || member.role.includes(normalized);
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
      if (!result.response.ok) throw new Error(result.payload.error?.message ?? "Thay đổi membership bị từ chối.");
      await loadMembers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể thay đổi membership.");
    } finally {
      setPendingId(null);
    }
  }

  async function createGrant(event: FormEvent<HTMLFormElement>, member: Membership) {
    event.preventDefault();
    const capability = grantCapability[member.id] ?? "operations.read";
    setPendingId(member.id);
    setError("");
    try {
      const result = await readApi("/api/v1/members/" + member.id + "/grants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ capability, branchId: null, expiresAt: null })
      });
      if (!result.response.ok) throw new Error(result.payload.error?.message ?? "Không thể cấp grant.");
      await loadMembers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cấp grant.");
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <div className="admin-state" role="status">Đang tải danh sách thành viên…</div>;
  if (restricted) return <div className="restricted-card admin-restricted"><strong>Cần quyền quản trị</strong><p>Chỉ owner hoặc admin của cây mới xem được membership và grant. Dữ liệu riêng tư không được gửi xuống trình duyệt.</p></div>;

  return (
    <section className="membership-admin" aria-label="Danh sách thành viên">
      <div className="membership-toolbar">
        <label>Tìm thành viên<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Tên hoặc vai trò" /></label>
        <label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả</option><option value="active">Đang hoạt động</option><option value="suspended">Tạm ngưng</option><option value="revoked">Đã thu hồi</option><option value="pending">Đang chờ</option></select></label>
      </div>
      {error ? <p className="field-error" role="alert">{error} <button className="button-secondary" type="button" onClick={loadMembers}>Thử lại</button></p> : null}
      {visibleMembers.length === 0 ? <div className="admin-state"><strong>Chưa có thành viên phù hợp</strong><p>Thử đổi bộ lọc hoặc mời thành viên từ luồng invitation đã được duyệt.</p></div> : null}
      <div className="membership-list">
        {visibleMembers.map((member) => {
          const locked = member.role === "owner";
          return (
            <article className="card membership-card" key={member.id}>
              <div className="membership-card-head">
                <div><span className="status-label">{member.role}</span><h2>{member.displayName}</h2><p className="muted">Phiên MFA: {member.mfaEnrolled ? "đã xác nhận" : "chưa xác nhận"} · Version {member.version}</p></div>
                <span className={"membership-status membership-status-" + member.status}>{member.status}</span>
              </div>
              <div className="membership-grants"><strong>Grant đang hiệu lực</strong>{member.grants.length ? <ul>{member.grants.map((grant) => <li key={grant.id}>{grant.capability}{grant.branchId ? " · theo chi" : " · toàn cây"}</li>)}</ul> : <p className="muted">Chưa có grant bổ sung.</p>}</div>
              {locked ? <p className="membership-locked">Owner chỉ thay đổi qua quy trình chuyển quyền có hai bên xác nhận.</p> : (
                <>
                  <form className="membership-form" onSubmit={(event) => updateMember(event, member)}>
                    <label>Vai trò<select name="role" defaultValue={member.role}><option value="admin">Admin</option><option value="reviewer">Reviewer</option><option value="editor">Editor</option><option value="member">Member</option></select></label>
                    <label>Trạng thái<select name="status" defaultValue={member.status}><option value="active">Đang hoạt động</option><option value="suspended">Tạm ngưng</option><option value="revoked">Thu hồi</option></select></label>
                    <label className="membership-reason">Lý do thay đổi<input name="reason" minLength={5} maxLength={2000} placeholder="Ghi lý do để audit" required /></label>
                    <button className="button-primary" type="submit" disabled={pendingId === member.id}>{pendingId === member.id ? "Đang lưu…" : "Lưu thay đổi"}</button>
                  </form>
                  <form className="membership-grant-form" onSubmit={(event) => createGrant(event, member)}>
                    <label>Cấp grant<select value={grantCapability[member.id] ?? "operations.read"} onChange={(event) => setGrantCapability((current) => ({ ...current, [member.id]: event.target.value }))}>{capabilities.map((capability) => <option value={capability} key={capability}>{capability}</option>)}</select></label>
                    <button className="button-secondary" type="submit" disabled={pendingId === member.id}>Cấp grant</button>
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