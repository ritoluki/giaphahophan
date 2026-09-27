import { FoundationPage } from "../_components/foundation-page";
import { MfaSetup } from "./mfa-setup";

export default function MfaSetupPage() {
  return (
    <FoundationPage
      kicker="Tài khoản · Bảo mật"
      title="Thiết lập xác thực bổ sung"
      description="MFA dùng TOTP của ứng dụng xác thực. Mã bí mật chỉ hiển thị trong phiên đã xác thực và không được ghi vào log hay dữ liệu gia phả."
    >
      <MfaSetup />
    </FoundationPage>
  );
}