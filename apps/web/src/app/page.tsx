import Link from "next/link";
import { DemoNotice, SectionHeading, SiteShell } from "./_components/site-chrome";
import { SearchBox } from "./_components/search-box";
import { demoEvents } from "../lib/demo-data";
import { SiteIcon } from "./_components/site-icon";

export default function HomePage() {
  return (
    <SiteShell active="home">
      <main id="main-content" tabIndex={-1} className="container home-page">
        <section className="home-intro" aria-labelledby="home-title">
          <h1 id="home-title">Tìm người trong gia phả</h1>
          <p>Tra cứu người thân và tìm hiểu các thế hệ trong gia đình.</p>
          <SearchBox />
          <Link className="home-family-link" href="/gia-pha">Xem gia đình và các nhánh<SiteIcon name="arrow" size={20} /></Link>
        </section>
        <DemoNotice />
        <div className="home-columns">
          <section className="home-guide" aria-labelledby="family-title">
            <SectionHeading id="family-title" title="Gia phả của gia đình" />
            <p>Mỗi người có một hồ sơ riêng, cùng những mối quan hệ và tư liệu đã được ghi nhận.</p>
            <nav className="home-quick-links" aria-label="Khám phá gia phả">
              <Link href="/gia-pha"><span><strong>Xem gia đình</strong><small>Bắt đầu từ một người, lần theo các thế hệ.</small></span><SiteIcon name="arrow" /></Link>
              <Link href="/quan-he"><span><strong>Tìm quan hệ</strong><small>Xem mối liên hệ giữa hai người.</small></span><SiteIcon name="arrow" /></Link>
              <Link href="/tu-lieu"><span><strong>Đọc tư liệu</strong><small>Xem sổ ghi chép, hình ảnh và nguồn thông tin.</small></span><SiteIcon name="arrow" /></Link>
            </nav>
          </section>
          <section className="home-calendar" aria-labelledby="upcoming-title">
            <SectionHeading id="upcoming-title" title="Lịch họ" href="/lich-ho" linkLabel="Xem lịch" />
            <div className="home-events">
              {demoEvents.slice(0, 3).map((event) => (
                <article className="home-event" key={event.id}>
                  <SiteIcon name="calendar" size={24} />
                  <div><h3>{event.title}</h3><p>{event.lunarLabel}</p><small>{event.reviewStatus === "approved" ? "Đã duyệt nội dung" : "Chờ đối chiếu ngày"}</small></div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
      <footer className="container site-footer"><span>Phan Gia Phả</span><Link href="/gioi-thieu">Về gia phả này</Link></footer>
    </SiteShell>
  );
}
