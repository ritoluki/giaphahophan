type FoundationPageProps = { kicker: string; title: string; description: string; actionHref?: string; actionLabel?: string };

export function FoundationPage({ kicker, title, description, actionHref, actionLabel }: FoundationPageProps) {
  return <div className="site-shell"><main className="container page"><a href="/" className="muted">← Trang chủ</a><p className="eyebrow">{kicker}</p><h1>{title}</h1><div className="card"><h2>Nội dung đang được chuẩn bị</h2><p>{description}</p>{actionHref && actionLabel ? <a className="button-primary" href={actionHref}>{actionLabel}</a> : null}</div></main><nav className="bottom-nav" aria-label="Điều hướng trên điện thoại"><a href="/"><span>⌂</span>Trang chủ</a><a href="/gia-pha"><span>⌘</span>Gia phả</a><a href="/tu-lieu"><span>▤</span>Tư liệu</a><a href="/lich-ho"><span>♧</span>Lịch họ</a><a href="/them"><span>⋯</span>Thêm</a></nav></div>;
}
