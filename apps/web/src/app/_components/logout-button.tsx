"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/v1/auth/sign-out", { method: "POST" });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(payload.error?.message ?? "Không thể kết thúc phiên lúc này.");
        return;
      }
      router.push("/dang-nhap");
      router.refresh();
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="account-action">
      <button className="button-secondary" type="button" onClick={logout} disabled={pending}>
        {pending ? "Đang đăng xuất…" : "Đăng xuất"}
      </button>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}
