import Image from "next/image";
import Link from "next/link";
import { DemoNotice, SectionHeading, SiteShell } from "./_components/site-chrome";
import { SearchBox } from "./_components/search-box";
import { demoEvents } from "../lib/demo-data";

export default function HomePage() {
  return (
    <SiteShell active="home">
      <main id="main-content" tabIndex={-1} className="container">
        <section className="hero" aria-labelledby="hero-title">
          <Image className="hero-image" src="/assets/hero-mobile.png" alt="" fill priority sizes="(max-width: 767px) 100vw, 1200px" />
          <div className="hero-overlay" />
          <div className="hero-content">
            <div className="eyebrow">Dữ liệu minh họa · Không phải lịch sử thực tế</div>
            <h1 id="hero-title">Một gia phả là câu chuyện về những người đi trước.</h1>
            <p>Lưu giữ ký ức có nguồn. Kết nối các thế hệ trong một không gian trang nghiêm, rõ ràng và riêng tư.</p>
            <div className="hero-actions">
              <Link className="button-primary" href="/tra-cuu">Tra cứu người thân <span aria-hidden="true">→</span></Link>
              <Link className="button-secondary" href="/gia-pha">Mở cây gia phả</Link>
            </div>
          </div>
        </section>
        <SearchBox />
        <DemoNotice />
        <section className="section" aria-labelledby="upcoming-title">
          <SectionHeading title="Sắp tới" href="/lich-ho" linkLabel="Xem lịch họ" />
          <div className="cards">
            {demoEvents.map((event) => (
              <article className="card event-card" key={event.id}>
                <div className="event-date"><span>ÂM LỊCH</span><strong>—</strong><span>Chưa đổi ngày</span></div>
                <div><h3>{event.title}</h3><p>{event.lunarLabel} · {event.reviewStatus === "approved" ? "Đã duyệt" : "Đang chờ đối chiếu"}</p></div>
              </article>
            ))}
          </div>
        </section>
        <section className="section" aria-labelledby="start-title">
          <SectionHeading title="Bắt đầu từ đâu?" />
          <div className="cards editorial-cards">
            <Link className="card" href="/gia-pha"><h3>Gia phả dòng họ</h3><p>Xem nhánh gần và mở sơ đồ khi bạn chủ động chọn.</p></Link>
            <Link className="card" href="/tra-cuu"><h3>Hồ sơ có nguồn</h3><p>Tìm người bằng tên, mã hồ sơ, chi họ và mốc năm.</p></Link>
            <Link className="card" href="/tu-lieu"><h3>Tư liệu đối chiếu</h3><p>Mỗi thông tin quan trọng cần có nơi để đọc lại và xác minh.</p></Link>
          </div>
        </section>
      </main>
      <footer className="container site-footer"><span>Phan Gia Phả</span><span>Demo mode · Không dùng dữ liệu thật</span></footer>
    </SiteShell>
  );
}
