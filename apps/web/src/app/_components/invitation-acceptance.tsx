"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

type AcceptanceResult = {
  data?: { status?: "pending" | "queued" | "revoked" };
  error?: { code?: string; message?: string };
};

export function InvitationAcceptance({ token }: { token: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    idempotencyKey.current ??= window.crypto.randomUUID();

    try {
      const response = await fetch("/api/v1/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current
        },
        body: JSON.stringify({ token })
      });
      const payload = (await response.json()) as AcceptanceResult;
      if (!response.ok || payload.data?.status !== "pending") {
        setError(payload.error?.message ?? "Lời mời chưa thể được xác nhận. Vui lòng kiểm tra phiên đăng nhập và thử lại.");
        return;
      }
      setAccepted(true);
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại khi mạng ổn định.");
    } finally {
      setPending(false);
    }
  }

  if (accepted) {
    return (
      <main id="main-content" className="container page invitation-page">
        <p className="eyebrow">Lời mời · Đã tiếp nhận</p>
        <section className="card invitation-card" aria-labelledby="invitation-success-title">
          <div className="invitation-seal" aria-hidden="true">✓</div>
          <h1 id="invitation-success-title">Lời mời đã được ghi nhận</h1>
          <p>Tài khoản của bạn đang chờ người quản trị gia phả phê duyệt. Email đã xác thực không tự động trở thành quyền thành viên.</p>
          <Link className="button-primary" href="/gia-pha">Về gia phả</Link>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="container page invitation-page">
      <p className="eyebrow">Lời mời · Thành viên gia phả</p>
      <section className="card invitation-card" aria-labelledby="invitation-title">
        <div className="invitation-seal" aria-hidden="true">PG</div>
        <h1 id="invitation-title">Xác nhận lời mời</h1>
        <p>Lời mời này chỉ dành cho tài khoản có địa chỉ email khớp với lời mời. Vui lòng đăng nhập hoặc tạo tài khoản bằng email đã nhận lời mời trước khi tiếp tục.</p>
        <div className="invitation-notice" role="note">
          <strong>Bảo vệ gia phả</strong>
          <span>Thông tin về gia phả và vai trò sẽ chỉ hiển thị sau khi máy chủ xác thực đúng tài khoản. Quyền thành viên vẫn cần được phê duyệt.</span>
        </div>
        <form onSubmit={submit}>
          <label className="invitation-check">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Tôi xác nhận đã đọc và đồng ý sử dụng lời mời này cho chính tài khoản của mình.</span>
          </label>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <div className="invitation-actions">
            <button className="button-primary" type="submit" disabled={!confirmed || pending}>
              {pending ? "Đang xác nhận…" : "Tiếp tục với tài khoản này"}
            </button>
            <Link className="button-secondary" href={`/dang-nhap?next=/loi-moi/${encodeURIComponent(token)}`}>Đăng nhập trước</Link>
          </div>
        </form>
        <p className="muted invitation-footnote">Lời mời có thời hạn và chỉ sử dụng được một lần. Nếu liên kết đã hết hạn hoặc không đúng email, hãy liên hệ người quản trị gia phả.</p>
      </section>
    </main>
  );
}