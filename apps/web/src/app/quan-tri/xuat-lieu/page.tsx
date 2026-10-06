import { AdminShell, DemoNotice } from "../../_components/site-chrome";
import { ExportWorkspace } from "./export-workspace";

export default function ExportPage() {
  return <AdminShell><main id="main-content" className="container page admin-page import-page">
    <p className="eyebrow">Quản trị · Xuất liệu riêng tư</p><h1>Xuất gia phả</h1>
    <p className="page-lede">Chọn phạm vi đã được cấp quyền, xem dữ liệu được phép xuất và theo dõi yêu cầu đã lưu.</p>
    <DemoNotice /><ExportWorkspace />
  </main></AdminShell>;
}
