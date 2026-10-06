import Link from "next/link";
import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { demoEvents } from "../../lib/demo-data";

export default function CalendarPage() {
  return (
    <SiteShell active="calendar">
      <main id="main-content" tabIndex={-1} className="container page">
        <p className="eyebrow">Âm lịch Việt Nam · Asia/Ho_Chi_Minh</p>
        <h1>Lịch họ & sự kiện</h1>
        <p className="page-lede">Ngày giỗ hiển thị ngày âm, ngày dương và quy ước tháng nhuận. Bộ chuyển đổi ngày âm sẽ chỉ bật sau golden tests.</p>
        <DemoNotice />
        <section className="timeline" aria-label="Danh sách sự kiện minh họa">
          {demoEvents.map((event) => (
            <article className="timeline-item" key={event.id}>
              <div className="timeline-marker" aria-hidden="true" />
              <div className="card"><p className="eyebrow">{event.recurrence === "annual_lunar" ? "Hằng năm · Âm lịch" : "Sự kiện"}</p><h2>{event.title}</h2><p>{event.lunarLabel}</p><span className="status-label">{event.reviewStatus === "approved" ? "Đã duyệt" : "Cần đối chiếu trước khi công bố"}</span></div>
            </article>
          ))}
        </section>
        <div className="restricted-card"><strong>Không tự sinh ngày</strong><p>Demo giữ trạng thái chờ đối chiếu thay vì lặp sự kiện mỗi 365 ngày hoặc tự chuyển lịch chưa có adapter.</p><Link href="/gioi-thieu">Đọc nguyên tắc dữ liệu →</Link></div>
      </main>
    </SiteShell>
  );
}
