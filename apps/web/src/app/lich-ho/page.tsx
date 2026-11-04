import Link from "next/link";
import { DemoNotice, SiteShell } from "../_components/site-chrome";
import { demoEvents } from "../../lib/demo-data";

export default function CalendarPage() {
  return (
    <SiteShell active="calendar">
      <main id="main-content" tabIndex={-1} className="container page">
        <h1>Lịch họ</h1>
        <p className="page-lede">Theo dõi ngày giỗ và những dịp sum họp của gia đình.</p>
        <DemoNotice />
        <section className="timeline" aria-label="Danh sách sự kiện minh họa">
          {demoEvents.map((event) => (
            <article className="timeline-item" key={event.id}>
              <div className="timeline-marker" aria-hidden="true" />
              <div className="card"><h2>{event.title}</h2><p>{event.lunarLabel}</p><p className="muted">{event.recurrence === "annual_lunar" ? "Hằng năm theo âm lịch Việt Nam" : event.recurrence === "annual_solar" ? "Hằng năm theo dương lịch" : "Diễn ra một lần"}</p><span className="status-label">{event.reviewStatus === "approved" ? "Đã duyệt" : event.reviewStatus === "cancelled" ? "Đã hủy" : "Cần đối chiếu ngày"}</span></div>
            </article>
          ))}
        </section>
        <div className="restricted-card"><strong>Ngày tổ chức cần được xác nhận</strong><p>Bản minh họa hiện giữ ngày theo tư liệu gốc. Chưa có ngày dương lịch được xác nhận để dùng làm lịch hẹn hoặc nhắc giỗ.</p><Link href="/gioi-thieu">Về Phan Gia Phả</Link></div>
      </main>
    </SiteShell>
  );
}
