"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

type ApiPayload = {
  data?: { accepted?: boolean; updated?: boolean };
};

function requestIdempotencyKey() {
  return crypto.randomUUID();
}

export function RecoveryForm() {
  const searchParams = useSearchParams();
  const resetMode = searchParams.get("mode") === "reset";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("pending");
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/password-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestIdempotencyKey() },
        body: JSON.stringify({ email })
      });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.data?.accepted) {
        setStatus("error");
        setMessage("Chưa thể gửi hướng dẫn lúc này. Vui lòng thử lại sau.");
        return;
      }
      setStatus("success");
      setMessage("Nếu tài khoản tồn tại, hướng dẫn phục hồi đã được gửi đến email bạn cung cấp.");
    } catch {
      setStatus("error");
      setMessage("Không thể kết nối. Vui lòng thử lại.");
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setStatus("error");
      setMessage("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setStatus("pending");
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/password-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.data?.updated) {
        setStatus("error");
        setMessage(response.status === 401 ? "Liên kết phục hồi đã hết hạn hoặc chưa được xác thực." : "Chưa thể đổi mật khẩu lúc này.");
        return;
      }
      setStatus("success");
      setMessage("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập lại.");
    } catch {
      setStatus("error");
      setMessage("Không thể kết nối. Vui lòng thử lại.");
    }
  }

  if (resetMode) {
    return (
      <div className="recovery-panel">
        <p className="muted">Tạo mật khẩu mới cho tài khoản của bạn.</p>
        <form className="card recovery-form" onSubmit={submitPassword} noValidate>
          <div className="filter-row">
            <label htmlFor="recovery-password">Mật khẩu mới</label>
            <input id="recovery-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="filter-row">
            <label htmlFor="recovery-confirmation">Nhập lại mật khẩu mới</label>
            <input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
          {message ? <p className={status === "error" ? "field-error" : "form-notice"} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
          {status === "success" ? <Link className="button-primary" href="/dang-nhap">Đến trang đăng nhập</Link> : <button className="button-primary" type="submit" disabled={status === "pending"}>{status === "pending" ? "Đang cập nhật…" : "Đổi mật khẩu"}</button>}
        </form>
      </div>
    );
  }

  return (
    <div className="recovery-panel">
      <form className="card recovery-form" onSubmit={submitRecovery} noValidate>
        <div className="filter-row">
          <label htmlFor="recovery-email">Email</label>
          <input id="recovery-email" name="email" type="email" autoComplete="email" maxLength={320} required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {message ? <p className={status === "error" ? "field-error" : "form-notice"} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
        <button className="button-primary" type="submit" disabled={status === "pending"}>{status === "pending" ? "Đang gửi…" : "Gửi hướng dẫn phục hồi"}</button>
      </form>
      <p className="muted"><Link href="/dang-nhap">Quay lại đăng nhập</Link></p>
    </div>
  );
}