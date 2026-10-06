import { AdminShell } from "../../_components/site-chrome";
import { ImportIntake } from "./import-intake";

export default function ImportIntakePage() {
  return (
    <AdminShell>
      <main id="main-content" tabIndex={-1} className="container page admin-page import-page">
        <p className="eyebrow">Quản trị · Nhập liệu riêng tư</p>
        <h1>Tiếp nhận tư liệu</h1>
        <p className="page-lede">Tiếp nhận JSON, CSV hoặc GEDCOM vào kho riêng, xem trước, duyệt độc lập và áp dụng hồ sơ vào cây demo.</p>
        <ImportIntake />
      </main>
    </AdminShell>
  );
}
