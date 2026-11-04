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
  empty: ["Chưa có dữ liệu hỗ trợ", "Kỳ này chưa có quyết định hỗ trợ được chia sẻ trong báo cáo."],
  error: ["Không tải được báo cáo", "Hãy kiểm tra kết nối rồi thử lại."],
  restricted: ["Bạn chưa có quyền xem báo cáo này", "Hãy liên hệ người phụ trách quỹ nếu cần xem báo cáo."],
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
      <main id="main-content" tabIndex={-1} className="container page scholarship-report-page">
        <h1>Báo cáo khuyến học</h1>
        <p className="page-lede">Tổng hợp các khoản đã duyệt, đã chi và đã đảo giao dịch trong kỳ.</p>
        <DemoNotice />

        {state !== "ready" ? <StateCard state={state} /> : report ? <>
          <section className="scholarship-report-period" aria-label="Kỳ báo cáo">
            <span>Kỳ báo cáo</span>
            <strong>{formatDate(report.from)} – {formatDate(report.to)}</strong>
            <small>Quỹ khuyến học · {report.awardsCount} quyết định hỗ trợ trong kỳ</small>
          </section>

          <SectionHeading title="Số liệu chính" />
          <section className="scholarship-report-grid" aria-label="Số liệu báo cáo khuyến học">
            <article className="scholarship-report-metric"><span>Đã duyệt</span><strong>{formatVnd(report.approvedAmountVnd)}</strong><small>Được duyệt chưa có nghĩa đã chi tiền.</small></article>
            <article className="scholarship-report-metric"><span>Đã ghi nhận chi</span><strong>{formatVnd(report.paidAmountVnd)}</strong><small>Có phiếu chi đã ghi sổ.</small></article>
            <article className="scholarship-report-metric"><span>Đã đảo giao dịch chi</span><strong>{formatVnd(report.reversedAmountVnd)}</strong><small>Lịch sử phiếu gốc vẫn được giữ.</small></article>
            <article className="scholarship-report-metric is-emphasis"><span>Thực chi sau đối chiếu</span><strong>{formatVnd(report.netPaidAmountVnd)}</strong><small>Tổng đã chi trừ các giao dịch chi đã đảo trong kỳ.</small></article>
          </section>

          <SectionHeading title="Phạm vi dữ liệu" />
          <section className="scholarship-report-scope-card">
            <dl className="scholarship-meta-list">
              <div><dt>Số ứng viên</dt><dd>{report.applicantsCount === null ? "Ẩn theo quyền" : report.applicantsCount}</dd></div>
              <div><dt>Số người đóng góp</dt><dd>{report.donorsCount === null ? "Chưa được chia sẻ với bạn" : report.donorsCount}</dd></div>
            </dl>
            <p>Báo cáo này chỉ tổng hợp số liệu. Hồ sơ cá nhân, thông tin trẻ em, tài liệu minh chứng và danh tính từng người đóng góp được giữ riêng tư.</p>
          </section>
        </> : <StateCard state="empty" />}
      </main>
    </AdminShell>
  );
}
