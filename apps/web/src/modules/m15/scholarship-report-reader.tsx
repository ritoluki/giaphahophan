import type { ScholarshipReportRecord } from "@phan/contracts";
import { AdminShell, DemoNotice, SectionHeading } from "../../app/_components/site-chrome";

export type ScholarshipReportState = "loading" | "empty" | "error" | "restricted" | "ready";

export const demoScholarshipReport: ScholarshipReportRecord = {
  fundId: "b9500000-0000-4000-8000-000000000001",
  from: "2026-01-01",
  to: "2026-12-31",
  awardsCount: 1,
  applicantsCount: null,
  donorsCount: null,
  approvedAmountVnd: "300000",
  paidAmountVnd: "300000",
  reversedAmountVnd: "0",
  netPaidAmountVnd: "300000",
};

const stateCopy: Record<Exclude<ScholarshipReportState, "ready">, [string, string]> = {
  loading: ["Đang tải báo cáo", "Đang đối chiếu kỳ báo cáo trong phạm vi quỹ được phép xem."],
  empty: ["Chưa có dữ liệu hỗ trợ", "Kỳ này chưa có award đủ điều kiện hiển thị."],
  error: ["Không tải được báo cáo", "Hãy thử lại; báo cáo không chứa hồ sơ riêng tư hoặc chứng từ thô."],
  restricted: ["Báo cáo được giới hạn", "Phiên hiện tại chưa có quyền xem báo cáo quỹ này."],
};

function formatVnd(value: string) {
  return new Intl.NumberFormat("vi-VN").format(BigInt(value)) + " ₫";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value + "T00:00:00+07:00"));
}

function StateCard({ state }: { state: Exclude<ScholarshipReportState, "ready"> }) {
  const [title, message] = stateCopy[state];
  return <div className="scholarship-state-card" role={state === "error" ? "alert" : "status"}><strong>{title}</strong><span>{message}</span></div>;
}

export function ScholarshipReportReader({ report = demoScholarshipReport, state = "ready" }: { report?: ScholarshipReportRecord | null; state?: ScholarshipReportState }) {
  return (
    <AdminShell>
      <main id="main-content" className="container page scholarship-report-page">
        <p className="eyebrow">Quản trị · Báo cáo khuyến học</p>
        <h1>Tổng hợp hỗ trợ</h1>
        <p className="page-lede">Đối chiếu award với bút toán đã posted trong một kỳ. Báo cáo chỉ trả projection được phép, không phải xác nhận kiểm toán hay đồng bộ ngân hàng.</p>
        <DemoNotice />

        {state !== "ready" ? <StateCard state={state} /> : report ? <>
          <section className="scholarship-report-period" aria-label="Kỳ báo cáo">
            <span>Kỳ báo cáo</span>
            <strong>{formatDate(report.from)} – {formatDate(report.to)}</strong>
            <small>Quỹ khuyến học · {report.awardsCount} award trong kỳ</small>
          </section>

          <SectionHeading title="Số liệu chính" />
          <section className="scholarship-report-grid" aria-label="Số liệu báo cáo khuyến học">
            <article className="scholarship-report-metric"><span>Đã duyệt</span><strong>{formatVnd(report.approvedAmountVnd)}</strong><small>Giá trị award không đồng nghĩa đã chi.</small></article>
            <article className="scholarship-report-metric"><span>Đã ghi nhận chi</span><strong>{formatVnd(report.paidAmountVnd)}</strong><small>Chỉ journal có trạng thái posted.</small></article>
            <article className="scholarship-report-metric"><span>Đã reversal</span><strong>{formatVnd(report.reversedAmountVnd)}</strong><small>Lịch sử gốc không bị xóa.</small></article>
            <article className="scholarship-report-metric is-emphasis"><span>Hỗ trợ ròng</span><strong>{formatVnd(report.netPaidAmountVnd)}</strong><small>Paid trừ reversal trong kỳ.</small></article>
          </section>

          <SectionHeading title="Phạm vi dữ liệu" />
          <section className="scholarship-report-scope-card">
            <dl className="scholarship-meta-list">
              <div><dt>Số ứng viên</dt><dd>{report.applicantsCount === null ? "Ẩn theo quyền" : report.applicantsCount}</dd></div>
              <div><dt>Số donor</dt><dd>{report.donorsCount === null ? "Ẩn theo quyền" : report.donorsCount}</dd></div>
            </dl>
            <p>Không trả person ID, tên trẻ em, minh chứng, donor riêng lẻ hoặc nội dung hồ sơ trong aggregate report. Chi tiết chỉ được mở bởi projection và capability riêng.</p>
          </section>
        </> : <StateCard state="empty" />}
      </main>
    </AdminShell>
  );
}