import Link from "next/link";
import { DemoNotice, SectionHeading, SiteShell } from "../../app/_components/site-chrome";
import { SafeRichText } from "./safe-rich-text";
import type { DemoNewsPost } from "./demo-content";

export function NewsStateCard({ status }: { status: "loading" | "empty" | "error" | "restricted" }) {
  const copy = {
    loading: ["Đang tải nội dung", "Giữ nguyên bố cục trong khi kiểm tra bản đã duyệt."],
    empty: ["Chưa có bài viết công khai", "Nội dung sẽ xuất hiện sau khi được kiểm tra và xuất bản."],
    error: ["Không tải được nội dung", "Thử lại sau; bản nháp và dữ liệu riêng vẫn không bị lộ."],
    restricted: ["Nội dung được giới hạn", "Phiên hiện tại chưa có quyền xem bản đầy đủ."],
  }[status];
  return <div className="news-reader-state" role={status === "error" ? "alert" : "status"}><strong>{copy[0]}</strong><span>{copy[1]}</span></div>;
}

export function NewsIndex({ posts }: { posts: readonly DemoNewsPost[] }) {
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page news-reader-page">
        <p className="eyebrow">Tin họ · Đọc theo mạch chuyện</p>
        <h1>Những câu chuyện được gìn giữ</h1>
        <p className="page-lede">Bài viết dài, ảnh và nguồn được trình bày theo thứ tự rõ ràng; nội dung công khai chỉ đi ra từ bản đã duyệt.</p>
        <DemoNotice />
        <SectionHeading title="Bài viết minh họa" />
        {posts.length === 0 ? <NewsStateCard status="empty" /> : <div className="news-card-list">{posts.map((post) => <Link className="news-card" href={`/tin-ho/${post.slug}`} key={post.slug}><div className="news-card-meta"><span>{post.category}</span><span>{post.readingTime}</span></div><h2>{post.title}</h2><p>{post.summary}</p><span className="news-card-link">Đọc bài viết →</span></Link>)}</div>}
      </main>
    </SiteShell>
  );
}

export function NewsArticle({ post }: { post: DemoNewsPost }) {
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page news-reader-page">
        <Link className="news-back-link" href="/tin-ho">← Về Tin họ</Link>
        <article className="news-article">
          <header className="news-article-heading">
            <p className="eyebrow">{post.category}</p>
            <h1>{post.title}</h1>
            <p className="news-article-summary">{post.summary}</p>
            <div className="news-article-meta"><span>{post.publishedLabel}</span><span>{post.readingTime}</span></div>
          </header>
          <SafeRichText document={post.body} media={post.media} />
          <footer className="news-article-footer"><strong>Minh bạch nội dung</strong><span>Bài này là fixture giao diện. Tư liệu thật chỉ hiển thị sau khi có nguồn, quyền và revision được duyệt.</span></footer>
        </article>
      </main>
    </SiteShell>
  );
}
