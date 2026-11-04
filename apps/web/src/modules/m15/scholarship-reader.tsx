import type { ScholarshipApplicationRecord, ScholarshipAwardRecord, ScholarshipProgramRecord } from "@phan/contracts";
import { DemoNotice, SectionHeading, SiteShell } from "../../app/_components/site-chrome";
import { scholarshipApplicationStatusLabels, scholarshipAwardStatusLabels, scholarshipProgramStatusLabels } from "../../lib/ui-labels";

export type ScholarshipState = "loading" | "empty" | "error" | "restricted";

export const demoScholarshipProgram: ScholarshipProgramRecord = {
  id: "b9500000-0000-4000-8000-000000000010",
  version: 1,
  fundId: "b9500000-0000-4000-8000-000000000001",
  title: "Học bổng hiếu học 2026",
  criteria: "Dành cho con cháu trong dòng họ có tinh thần học tập tốt, hoàn cảnh cần được khích lệ và cam kết tiếp tục đóng góp tích cực cho gia đình.",
  closesAt: "2026-12-31T16:59:59.000Z",
  status: "open",
};

export const demoScholarshipApplication: ScholarshipApplicationRecord = {
  id: "b9500000-0000-4000-8000-000000000011",
  version: 1,
  programId: demoScholarshipProgram.id,
  personId: "b9500000-0000-4000-8000-000000000012",
  status: "needs_info",
  statement: "Hồ sơ minh họa đang chờ bổ sung minh chứng.",
  evidenceAssetId: "b9500000-0000-4000-8000-000000000013",
};

export const demoScholarshipAward: ScholarshipAwardRecord = {
  id: "b9500000-0000-4000-8000-000000000014",
  version: 1,
  applicationId: demoScholarshipApplication.id,
  fundId: demoScholarshipProgram.fundId,
  amountVnd: "300000",
  reason: "Khích lệ thành tích học tập minh họa.",
  approvedBy: "b9500000-0000-4000-8000-000000000015",
  paidJournalEntryId: null,
  reversalJournalEntryId: null,
  status: "approved",
};

const stateCopy: Record<ScholarshipState, [string, string]> = {
  loading: ["Đang tải chương trình", "Vui lòng chờ trong giây lát."],
  empty: ["Chưa có chương trình mở", "Các chương trình sẽ xuất hiện sau khi được công bố và gắn quỹ phù hợp."],
  error: ["Không tải được chương trình", "Hãy kiểm tra kết nối rồi thử lại."],
  restricted: ["Bạn chưa có quyền xem nội dung này", "Hãy liên hệ ban khuyến học nếu cần xem hồ sơ hoặc kết quả hỗ trợ."],
};

export function ScholarshipStateCard({ status }: { status: ScholarshipState }) {
  const [title, message] = stateCopy[status];
  return <div className="scholarship-state-card" role={status === "error" ? "alert" : "status"}><strong>{title}</strong><span>{message}</span></div>;
}

function formatVnd(value: string) {
  return new Intl.NumberFormat("vi-VN").format(BigInt(value)) + " ₫";
}

function formatDeadline(value: string | null) {
  if (!value) return "Chưa đặt hạn";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export function ScholarshipReader({ program = demoScholarshipProgram, application = demoScholarshipApplication, award = demoScholarshipAward }: { program?: ScholarshipProgramRecord; application?: ScholarshipApplicationRecord | null; award?: ScholarshipAwardRecord | null }) {
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page scholarship-page">
        <h1>Chương trình khuyến học</h1>
        <p className="page-lede">Cùng động viên con cháu học tập. Xem tiêu chí, hạn nhận hồ sơ và kết quả hỗ trợ của từng chương trình.</p>
        <DemoNotice />

        <section className="scholarship-hero-card" aria-labelledby="scholarship-program-title">
          <h2 id="scholarship-program-title">{program.title}</h2>
          <p>{program.criteria}</p>
          <dl className="scholarship-meta-list">
            <div><dt>Hạn nhận hồ sơ</dt><dd>{formatDeadline(program.closesAt)}</dd></div>
            <div><dt>Nguồn quỹ</dt><dd>Quỹ khuyến học dòng họ</dd></div>
            <div><dt>Trạng thái</dt><dd>{scholarshipProgramStatusLabels[program.status]}</dd></div>
          </dl>
          <a className="button-secondary" href="#scholarship-privacy">Về hồ sơ và quyền riêng tư</a>
        </section>

        <SectionHeading title="Theo dõi hồ sơ" />
        {application ? <section className="scholarship-application-card" aria-label="Trạng thái hồ sơ minh họa">
          <div className="scholarship-application-head"><span>Hồ sơ minh họa</span><span className="scholarship-status-pill">{scholarshipApplicationStatusLabels[application.status]}</span></div>
          <h2>{scholarshipApplicationStatusLabels[application.status]}</h2>
          <p>{application.statement}</p>
          <small>Minh chứng được lưu riêng tư; không hiển thị trong trang công khai.</small>
        </section> : <ScholarshipStateCard status="empty" />}

        <SectionHeading title="Kết quả hỗ trợ" />
        {award ? <section className="scholarship-award-card" aria-label="Kết quả hỗ trợ minh họa">
          <div className="scholarship-application-head"><span>Quyết định minh họa</span><span className="scholarship-status-pill">{scholarshipAwardStatusLabels[award.status]}</span></div>
          <h2>Khoản hỗ trợ học tập</h2>
          <dl className="scholarship-meta-list">
            <div><dt>Mức hỗ trợ</dt><dd>{formatVnd(award.amountVnd)}</dd></div>
            <div><dt>Thanh toán</dt><dd>{award.status === "reversed" ? "Giao dịch chi đã được đảo" : award.paidJournalEntryId ? "Đã có phiếu chi được ghi sổ" : "Chưa ghi nhận chi"}</dd></div>
            <div><dt>Trạng thái</dt><dd>{scholarshipAwardStatusLabels[award.status]}</dd></div>
          </dl>
          <small>Khoản hỗ trợ được duyệt chưa có nghĩa đã chi tiền. Việc chi được xác nhận bằng phiếu đã ghi sổ; nếu đảo giao dịch, lịch sử vẫn được giữ.</small>
        </section> : <ScholarshipStateCard status="restricted" />}

        <SectionHeading title="Câu chuyện được duyệt" />
        <section className="scholarship-story-card">
          <h2>Một hành trình học tập đáng trân trọng</h2>
          <p>Nội dung chỉ được chia sẻ sau khi có sự đồng ý phù hợp. Trẻ vị thành niên cần quy trình người giám hộ trước khi công bố.</p>
          <p className="muted">Đây là nội dung minh họa. Chưa có câu chuyện thật được công bố.</p>
        </section>

        <div id="scholarship-privacy" className="scholarship-privacy-note"><strong>Hồ sơ và quyền riêng tư</strong><span>Hồ sơ gồm người được đề cử, lời giới thiệu và tài liệu minh chứng được giữ riêng tư. Để chia sẻ câu chuyện thành tích, cần có tư liệu, sự đồng ý phù hợp và người duyệt. Hồ sơ trẻ em cần được xác minh với người giám hộ trước khi công bố.</span></div>
      </main>
    </SiteShell>
  );
}
