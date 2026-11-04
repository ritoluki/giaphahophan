"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getUiErrorMessage } from "../../lib/ui-error";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/v1/auth/sign-out", { method: "POST" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(getUiErrorMessage(payload, "Chưa đăng xuất được. Thử lại sau giây lát."));
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
