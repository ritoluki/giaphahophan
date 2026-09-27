"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type MfaStatus = {
  authenticated: boolean;
  aal: "aal1" | "aal2" | null;
  mfaEnrolled: boolean;
  factorId: string | null;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

type ApiPayload = {
  data?: MfaStatus & Partial<Enrollment> & { challengeId?: string };
  error?: { message?: string };
};

async function readApi(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = (await response.json()) as ApiPayload;
  return { response, payload };
}

export function MfaSetup() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadStatus() {
    setPending(true);
    try {
      const result = await readApi("/api/v1/auth/mfa/status");
      if (result.response.status === 401) {
        setStatus({ authenticated: false, aal: null, mfaEnrolled: false, factorId: null });
        return;
      }
      if (!result.response.ok || !result.payload.data) throw new Error(result.payload.error?.message ?? "Không thể tải trạng thái MFA.");
      setStatus({
        authenticated: result.payload.data.authenticated,
        aal: result.payload.data.aal ?? null,
        mfaEnrolled: result.payload.data.mfaEnrolled ?? false,
        factorId: result.payload.data.factorId ?? null
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    // The request is the external synchronization this effect owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, []);

  async function startChallenge(factorId: string) {
    const result = await readApi("/api/v1/auth/mfa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factorId })
    });
    if (!result.response.ok || !result.payload.data?.challengeId) throw new Error(result.payload.error?.message ?? "Không thể tạo thử thách MFA.");
    setChallengeId(result.payload.data.challengeId);
  }

  async function enroll() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await readApi("/api/v1/auth/mfa/enroll", { method: "POST" });
      if (!result.response.ok || !result.payload.data?.factorId || !result.payload.data.qrCode || !result.payload.data.secret || !result.payload.data.uri) {
        throw new Error(result.payload.error?.message ?? "Không thể bắt đầu thiết lập MFA.");
      }
      const nextEnrollment = {
        factorId: result.payload.data.factorId,
        qrCode: result.payload.data.qrCode,
        secret: result.payload.data.secret,
        uri: result.payload.data.uri
      };
      setEnrollment(nextEnrollment);
      await startChallenge(nextEnrollment.factorId);
      setNotice("Đã tạo factor. Quét QR hoặc nhập mã bí mật rồi điền mã 6 số để xác nhận.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể bắt đầu thiết lập MFA.");
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const factorId = enrollment?.factorId ?? status?.factorId;
    if (!factorId) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      let currentChallengeId = challengeId;
      if (!currentChallengeId) {
        await startChallenge(factorId);
        throw new Error("Thử thách mới đã được tạo. Vui lòng nhập mã hiện tại và gửi lại.");
      }
      const result = await readApi("/api/v1/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId, challengeId: currentChallengeId, code })
      });
      if (!result.response.ok || !result.payload.data) throw new Error(result.payload.error?.message ?? "Mã MFA chưa được chấp nhận.");
      setStatus({
        authenticated: result.payload.data.authenticated,
        aal: result.payload.data.aal ?? null,
        mfaEnrolled: result.payload.data.mfaEnrolled ?? true,
        factorId: result.payload.data.factorId ?? factorId
      });
      setEnrollment(null);
      setChallengeId(null);
      setCode("");
      setNotice("MFA đã được xác nhận cho phiên này.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mã MFA chưa được chấp nhận.");
    } finally {
      setPending(false);
    }
  }

  async function unenroll() {
    if (!status?.factorId || status.aal !== "aal2") return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await readApi("/api/v1/auth/mfa/unenroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: status.factorId })
      });
      if (!result.response.ok || !result.payload.data) throw new Error(result.payload.error?.message ?? "Không thể gỡ MFA theo policy hiện tại.");
      setStatus({
        authenticated: result.payload.data.authenticated,
        aal: result.payload.data.aal ?? null,
        mfaEnrolled: result.payload.data.mfaEnrolled ?? false,
        factorId: result.payload.data.factorId ?? null
      });
      setNotice("MFA đã được gỡ khỏi tài khoản này.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gỡ MFA theo policy hiện tại.");
    } finally {
      setPending(false);
    }
  }

  if (pending && !status) return <div className="mfa-state" aria-live="polite">Đang tải trạng thái MFA…</div>;
  if (status && !status.authenticated) return <div className="mfa-state"><strong>Cần đăng nhập</strong><p>Hãy đăng nhập bằng tài khoản được cấp quyền trước khi thiết lập MFA.</p><Link className="button-primary" href="/dang-nhap?next=/thiet-lap-mfa">Đăng nhập</Link></div>;

  return (
    <div className="mfa-panel">
      <div className="mfa-status" role="status">
        <strong>{status?.mfaEnrolled ? "MFA đã đăng ký" : "MFA chưa được đăng ký"}</strong>
        <span>Phiên hiện tại: {status?.aal === "aal2" ? "đã xác nhận MFA" : "chỉ xác thực mật khẩu"}</span>
      </div>
      {!status?.mfaEnrolled && !enrollment ? <button className="button-primary" type="button" onClick={enroll} disabled={pending}>Thiết lập ứng dụng xác thực</button> : null}
      {enrollment ? (
        <div className="mfa-enrollment">
          <div className="mfa-qr-frame"><img src={`data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCode)}`} alt="Mã QR thiết lập MFA" /></div>
          <label className="mfa-secret">Mã bí mật dự phòng<input type="text" value={enrollment.secret} readOnly autoComplete="off" /></label>
          <p className="muted">Không gửi mã bí mật qua chat hoặc lưu vào ảnh chụp. Chỉ dùng nó khi ứng dụng xác thực không quét được QR.</p>
        </div>
      ) : null}
      {status?.mfaEnrolled || enrollment ? (
        <form className="mfa-code-form" onSubmit={verify}>
          <label htmlFor="mfa-code">Mã xác thực 6 số</label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
          <button className="button-primary" type="submit" disabled={pending || code.length !== 6}>{pending ? "Đang xác nhận…" : "Xác nhận MFA"}</button>
        </form>
      ) : null}
      {status?.mfaEnrolled && status.aal === "aal2" ? <button className="button-danger" type="button" onClick={unenroll} disabled={pending}>Gỡ factor theo policy</button> : null}
      {notice ? <p className="mfa-notice" role="status">{notice}</p> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}