import { FoundationPage } from "../_components/foundation-page";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <FoundationPage
      kicker="Tài khoản · Lời mời"
      title="Đăng nhập thành viên"
      description="Đăng nhập để tiếp tục những thao tác cần quyền trong gia phả. Quyền truy cập vẫn được kiểm tra ở server và DB."
    >
      <LoginForm />
    </FoundationPage>
  );
}
