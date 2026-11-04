import { FoundationPage } from "../_components/foundation-page";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <FoundationPage
      kicker="Tài khoản · Lời mời"
      title="Đăng nhập"
      description="Dùng tài khoản đã được mời để xem gia phả và gửi thông tin bổ sung."
    >
      <LoginForm />
    </FoundationPage>
  );
}
