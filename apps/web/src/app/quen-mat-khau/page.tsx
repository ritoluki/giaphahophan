import { FoundationPage } from "../_components/foundation-page";
import { RecoveryForm } from "./recovery-form";

export default function RecoveryPage() {
  return (
    <FoundationPage
      kicker="Tài khoản · Bảo mật"
      title="Phục hồi tài khoản"
      description="Nhập email đã đăng ký. Vì lý do bảo mật, hệ thống luôn hiển thị cùng một hướng dẫn dù email có tồn tại hay không."
    >
      <RecoveryForm />
    </FoundationPage>
  );
}