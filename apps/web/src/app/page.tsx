const events = [
  { day: "12", month: "THÁNG 3", title: "Ngày tưởng niệm dòng họ", detail: "Âm lịch · Dữ liệu minh họa" },
  { day: "24", month: "THÁNG 4", title: "Gặp mặt các chi họ", detail: "Dương lịch · Chưa công bố địa điểm" },
  { day: "06", month: "THÁNG 5", title: "Buổi kể chuyện nguồn cội", detail: "Thành viên · Đang chờ duyệt" }
];

export default function HomePage() {
  return <div className="site-shell">
    <a className="skip-link" href="#main-content">Bỏ qua đến nội dung</a>
    <header className="container topbar">
      <a className="brand-lockup" href="/" aria-label="Phan Gia Phả - Trang chủ"><img src="/assets/logo-mark.png" alt="" /><span>Phan Gia Phả<small>Kết nối cội nguồn · Gìn giữ dòng tộc</small></span></a>
      <nav className="desktop-nav" aria-label="Điều hướng chính"><a href="/gioi-thieu">Giới thiệu</a><a href="/gia-pha">Gia phả</a><a href="/lich-ho">Lịch họ</a><a href="/tu-lieu">Tư liệu</a><a href="/tin-ho">Tin họ</a></nav>
      <button className="button-secondary menu-button" type="button" aria-label="Mở mục lục">☰</button>
    </header>
    <main id="main-content" className="container">
      <section className="hero" aria-labelledby="hero-title"><div className="hero-content"><div className="eyebrow">Dữ liệu minh họa · Không phải lịch sử thực tế</div><h1 id="hero-title">Một gia phả là câu chuyện về những người đi trước.</h1><p>Lưu giữ ký ức có nguồn. Kết nối các thế hệ trong một không gian trang nghiêm, rõ ràng và riêng tư.</p><div className="hero-actions"><a className="button-primary" href="/tra-cuu">Tra cứu người thân <span aria-hidden="true">→</span></a><a className="button-secondary" href="/gia-pha">Mở cây gia phả</a></div></div></section>
      <section className="search-panel" aria-labelledby="search-title"><label id="search-title" htmlFor="home-search">Tìm trong dòng họ</label><div className="search-row"><input id="home-search" type="search" placeholder="Tên người, chi họ, sự kiện…" /><a className="button-primary" href="/tra-cuu">Tìm</a></div></section>
      <div className="demo-banner" role="note">Dữ liệu minh họa — các tên, ngày và chi trong bản demo đều hư cấu.</div>
      <section className="section" aria-labelledby="upcoming-title"><div className="section-heading"><h2 id="upcoming-title">Sắp tới</h2><a href="/lich-ho">Xem lịch họ →</a></div><div className="cards">{events.map((event) => <article className="card event-card" key={event.title}><div className="event-date"><span>{event.month}</span><strong>{event.day}</strong><span>2025</span></div><div><h3>{event.title}</h3><p>{event.detail}</p></div></article>)}</div></section>
      <section className="section" aria-labelledby="start-title"><div className="section-heading"><h2 id="start-title">Bắt đầu từ đâu?</h2></div><div className="cards"><article className="card"><h3>Gia phả dòng họ</h3><p>Xem các nhánh và gia đình gần theo phạm vi được phép.</p></article><article className="card"><h3>Hồ sơ cá nhân</h3><p>Đọc thông tin có nguồn, ngày tháng chưa đầy đủ và lịch sử thay đổi.</p></article><article className="card"><h3>Tư liệu có nguồn</h3><p>Mỗi thông tin quan trọng đều có nơi để đối chiếu và xác minh.</p></article></div></section>
    </main>
    <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại"><a href="/" aria-current="page"><span aria-hidden="true">⌂</span>Trang chủ</a><a href="/gia-pha"><span aria-hidden="true">⌘</span>Gia phả</a><a href="/tu-lieu"><span aria-hidden="true">▤</span>Tư liệu</a><a href="/lich-ho"><span aria-hidden="true">♧</span>Lịch họ</a><a href="/them"><span aria-hidden="true">⋯</span>Thêm</a></nav>
  </div>;
}
