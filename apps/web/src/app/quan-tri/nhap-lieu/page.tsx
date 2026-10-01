import { AdminShell } from "../../_components/site-chrome";
import { ImportIntake } from "./import-intake";

export default function ImportIntakePage() {
  return (
    <AdminShell>
      <main id="main-content" className="container page admin-page import-page">
        <p className="eyebrow">Quản trị · Nhập liệu riêng tư</p>
        <h1>Tiếp nhận tư liệu</h1>
        <p className="page-lede">Tiếp nhận JSON, CSV hoặc GEDCOM demo vào kho riêng, kiểm tra checksum và xem trước các dòng cần rà soát. Bước này không ghi vào hồ sơ gia phả chính.</p>
        <ImportIntake />
      </main>
    </AdminShell>
  );
}
