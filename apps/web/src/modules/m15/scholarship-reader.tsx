import type { ScholarshipApplicationRecord, ScholarshipProgramRecord } from "@phan/contracts";
import { DemoNotice, SectionHeading, SiteShell } from "../../app/_components/site-chrome";

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

const statusLabels: Record<ScholarshipApplicationRecord["status"], string> = {
  draft: "Bản nháp",
  submitted: "Đã nộp",
  needs_info: "Cần bổ sung",
  approved: "Đã duyệt hồ sơ",
  rejected: "Chưa phù hợp",
  withdrawn: "Đã rút",
  awarded: "Đã ghi nhận trao",
};

const stateCopy: Record<ScholarshipState, [string, string]> = {
  loading: ["Đang tải chương trình", "Đang kiểm tra phạm vi cây và quyền xem hiện tại."],
  empty: ["Chưa có chương trình mở", "Các chương trình sẽ xuất hiện sau khi được công bố và gắn quỹ phù hợp."],
  error: ["Không tải được chương trình", "Hãy thử lại; lỗi không hiển thị hồ sơ riêng tư hoặc mã minh chứng."],
  restricted: ["Chương trình được giới hạn", "Phiên hiện tại chưa có quyền xem nội dung hoặc theo dõi hồ sơ này."],
};

export function ScholarshipStateCard({ status }: { status: ScholarshipState }) {
  const [title, message] = stateCopy[status];
  return <div className="scholarship-state-card" role={status === "error" ? "alert" : "status"}><strong>{title}</strong><span>{message}</span></div>;
}

function formatDeadline(value: string | null) {
  if (!value) return "Chưa đặt hạn";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export function ScholarshipReader({ program = demoScholarshipProgram, application = demoScholarshipApplication }: { program?: ScholarshipProgramRecord; application?: ScholarshipApplicationRecord | null }) {
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page scholarship-page">
        <p className="eyebrow">Khuyến học · Nội dung theo quyền</p>
        <h1>Chương trình khuyến học</h1>
        <p className="page-lede">Nơi dòng họ cùng khích lệ việc học. Tiêu chí và hạn nộp được công bố rõ; hồ sơ và minh chứng chỉ hiển thị cho đúng người.</p>
        <DemoNotice />

        <section className="scholarship-hero-card" aria-labelledby="scholarship-program-title">
          <div className="scholarship-card-kicker"><span>Đang mở</span><span>Phụ trách · Ban khuyến học</span></div>
          <h2 id="scholarship-program-title">{program.title}</h2>
          <p>{program.criteria}</p>
          <dl className="scholarship-meta-list">
            <div><dt>Hạn nhận hồ sơ</dt><dd>{formatDeadline(program.closesAt)}</dd></div>
            <div><dt>Nguồn quỹ</dt><dd>Quỹ khuyến học dòng họ</dd></div>
            <div><dt>Trạng thái</dt><dd>{program.status === "open" ? "Đang nhận đề cử" : program.status}</dd></div>
          </dl>
          <button className="button-primary" type="button">Xem tiêu chí & đề cử</button>
        </section>

        <SectionHeading title="Theo dõi hồ sơ của tôi" />
        {application ? <section className="scholarship-application-card" aria-label="Trạng thái hồ sơ minh họa">
          <div className="scholarship-application-head"><span>Hồ sơ minh họa</span><span className="scholarship-status-pill">{statusLabels[application.status]}</span></div>
          <h2>Hồ sơ đang chờ bổ sung</h2>
          <p>{application.statement}</p>
          <div className="scholarship-progress" aria-label="Tiến trình hồ sơ"><span className="is-complete">Đã nộp</span><span className="is-current">Cần bổ sung</span><span>Đang duyệt</span><span>Kết quả</span></div>
          <small>Minh chứng được lưu riêng tư; không hiển thị trong trang công khai.</small>
        </section> : <ScholarshipStateCard status="empty" />}

        <SectionHeading title="Câu chuyện được duyệt" />
        <section className="scholarship-story-card">
          <span className="scholarship-card-kicker">Bản demo · không phải dữ liệu thật</span>
          <h2>Một hành trình học tập đáng trân trọng</h2>
          <p>Nội dung chỉ được chia sẻ sau khi có sự đồng ý phù hợp. Trẻ vị thành niên cần quy trình người giám hộ trước khi công bố.</p>
          <span className="scholarship-story-link">Đọc câu chuyện đã được duyệt →</span>
        </section>

        <div className="scholarship-privacy-note"><strong>Thu thập tối thiểu</strong><span>Phiên bản đầu chỉ yêu cầu người được đề cử, lời giới thiệu và một minh chứng riêng tư. Thông tin học tập chi tiết hoặc dữ liệu trẻ em sẽ không tự động công khai.</span></div>
      </main>
    </SiteShell>
  );
}