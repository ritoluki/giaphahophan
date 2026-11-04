"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { getUiErrorMessage } from "../../lib/ui-error";

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
        setError(getUiErrorMessage(payload, "Chưa xác nhận được lời mời. Kiểm tra tài khoản đăng nhập rồi thử lại."));
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
      <main id="main-content" tabIndex={-1} className="container page invitation-page">
        <section className="card invitation-card" aria-labelledby="invitation-success-title">
          <h1 id="invitation-success-title">Lời mời đã được ghi nhận</h1>
          <p>Người quản lý gia phả sẽ kiểm tra lời mời và duyệt tài khoản của bạn.</p>
          <Link className="button-primary" href="/gia-pha">Về gia phả</Link>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="container page invitation-page">
      <section className="card invitation-card" aria-labelledby="invitation-title">
        <h1 id="invitation-title">Xác nhận lời mời</h1>
        <p>Đăng nhập bằng email đã nhận lời mời để tiếp tục. Nếu chưa có tài khoản, hãy liên hệ người quản lý gia phả.</p>
        <div className="invitation-notice" role="note">
          <strong>Lời mời dành riêng cho bạn</strong>
          <span>Đăng nhập bằng email đã nhận lời mời. Thông tin gia phả sẽ hiện sau khi tài khoản được kiểm tra và duyệt.</span>
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
