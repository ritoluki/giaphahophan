"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { mfaQrImageSource } from "../../lib/mfa-qr";

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
  const [showSecret, setShowSecret] = useState(false);

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
    return result.payload.data.challengeId;
  }

  async function enroll() {
    setPending(true);
    setError("");
    setNotice("");
    setEnrollment(null);
    setChallengeId(null);
    setCode("");
    setShowSecret(false);
    try {
      const result = await readApi("/api/v1/auth/mfa/enroll", { method: "POST" });
      if (!result.response.ok || !result.payload.data?.factorId || !result.payload.data.qrCode || !result.payload.data.secret || !result.payload.data.uri) {
        throw new Error(result.payload.error?.message ?? "Không thể bắt đầu thiết lập MFA.");
      }
      const nextEnrollment = {
        factorId: result.payload.data.factorId,
        qrCode: mfaQrImageSource(result.payload.data.qrCode),
        secret: result.payload.data.secret,
        uri: result.payload.data.uri
      };
      setEnrollment(nextEnrollment);
      await startChallenge(nextEnrollment.factorId);
      setNotice("Quét mã QR bằng ứng dụng xác thực trên điện thoại, rồi nhập mã 6 số do ứng dụng tạo.");
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
      const currentChallengeId = challengeId ?? await startChallenge(factorId);
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
      setShowSecret(false);
      setNotice("Đã hoàn tất xác thực hai bước. Bạn có thể tiếp tục dùng chức năng quản trị.");
    } catch (cause) {
      setChallengeId(null);
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
        <strong>{status?.mfaEnrolled ? "Đã bật xác thực hai bước" : enrollment ? "Đang thiết lập — cần xác nhận mã 6 số" : "Chưa bật xác thực hai bước"}</strong>
        <span>{status?.aal === "aal2" ? "Phiên hiện tại đã được xác thực hai bước." : "Bạn đã đăng nhập bằng mật khẩu. Hoàn tất bước dưới để dùng chức năng cần bảo mật bổ sung."}</span>
      </div>
      {!status?.mfaEnrolled && !enrollment ? <button className="button-primary" type="button" onClick={enroll} disabled={pending}>Thiết lập ứng dụng xác thực</button> : null}
      {enrollment ? (
        <div className="mfa-enrollment">
          <p>Mở ứng dụng xác thực trên điện thoại, thêm tài khoản bằng cách quét mã QR này.</p>
          <div className="mfa-qr-frame"><img src={enrollment.qrCode} alt="Mã QR thiết lập MFA" /></div>
          <button type="button" className="button-secondary" onClick={() => setShowSecret(value => !value)}>{showSecret ? "Ẩn mã thiết lập" : "Không quét được QR? Hiện mã để nhập thủ công"}</button>
          {showSecret && <label className="mfa-secret">Mã thiết lập thủ công<input type="text" value={enrollment.secret} readOnly autoComplete="off" /></label>}
          <p className="muted">Không gửi mã QR hoặc mã thiết lập qua chat hay ảnh chụp.</p>
          <button type="button" className="button-secondary" onClick={enroll} disabled={pending}>Tạo mã QR mới</button>
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
      {status?.aal === "aal2" && <Link className="button-primary" href="/quan-tri">Vào trang quản trị</Link>}
      {notice ? <p className="mfa-notice" role="status">{notice}</p> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}
