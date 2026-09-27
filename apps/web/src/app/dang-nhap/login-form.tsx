"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next-path";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next");
  const nextPath = safeNextPath(requestedNext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = (await response.json()) as { data?: { authenticated?: boolean }; error?: { message?: string } };
      if (!response.ok || !payload.data?.authenticated) {
        setError(payload.error?.message ?? "Đăng nhập chưa thành công.");
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="filter-row">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="filter-row">
        <label htmlFor="login-password">Mật khẩu</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <button className="button-primary" type="submit" disabled={pending}>
        {pending ? "Đang xác thực…" : "Đăng nhập"}
      </button>
      <p className="recovery-link"><Link href="/quen-mat-khau">Quên mật khẩu?</Link></p>
      <p className="muted">Tài khoản thành viên được cấp qua lời mời của gia phả. Không dùng dữ liệu thật trong bản demo.</p>
    </form>
  );
}
