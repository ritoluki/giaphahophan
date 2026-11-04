import { FoundationPage } from "../_components/foundation-page";
import { RecoveryForm } from "./recovery-form";

export default function RecoveryPage() {
  return (
    <FoundationPage
      kicker="Tài khoản · Bảo mật"
      title="Quên mật khẩu"
      description="Nhập email đã đăng ký để nhận hướng dẫn đặt lại mật khẩu."
    >
      <RecoveryForm />
    </FoundationPage>
  );
}
