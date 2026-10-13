import { FoundationPage } from "../_components/foundation-page";
import { MfaSetup } from "./mfa-setup";

export default function MfaSetupPage() {
  return (
    <FoundationPage
      kicker="Tài khoản · Bảo mật"
      title="Thiết lập xác thực hai bước"
      description="Thêm lớp bảo vệ cho tài khoản bằng ứng dụng tạo mã xác thực trên điện thoại."
    >
      <MfaSetup />
    </FoundationPage>
  );
}
