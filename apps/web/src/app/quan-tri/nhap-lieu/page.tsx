import { AdminShell } from "../../_components/site-chrome";
import { ImportIntake } from "./import-intake";

export default function ImportIntakePage() {
  return (
    <AdminShell>
      <main id="main-content" tabIndex={-1} className="container page admin-page import-page">
        <h1>Nhập gia phả từ tệp</h1>
        <p className="page-lede">Tải tệp JSON, CSV hoặc GEDCOM để kiểm tra. Hồ sơ chỉ được thêm vào gia phả minh họa sau khi có người khác duyệt.</p>
        <ImportIntake />
      </main>
    </AdminShell>
  );
}
