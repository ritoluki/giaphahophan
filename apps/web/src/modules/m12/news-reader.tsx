import Link from "next/link";
import { DemoNotice, SectionHeading, SiteShell } from "../../app/_components/site-chrome";
import { SafeRichText } from "./safe-rich-text";
import type { DemoNewsPost } from "./demo-content";

export function NewsStateCard({ status }: { status: "loading" | "empty" | "error" | "restricted" }) {
  const copy = {
    loading: ["Đang tải bài viết", "Vui lòng chờ trong giây lát."],
    empty: ["Chưa có bài viết công khai", "Nội dung sẽ xuất hiện sau khi được kiểm tra và xuất bản."],
    error: ["Không tải được bài viết", "Hãy kiểm tra kết nối rồi thử lại."],
    restricted: ["Bạn chưa có quyền đọc bài viết này", "Hãy đăng nhập hoặc liên hệ người phụ trách gia phả."],
  }[status];
  return <div className="news-reader-state" role={status === "error" ? "alert" : "status"}><strong>{copy[0]}</strong><span>{copy[1]}</span></div>;
}

export function NewsIndex({ posts }: { posts: readonly DemoNewsPost[] }) {
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page news-reader-page">
        <h1>Tin họ</h1>
        <p className="page-lede">Những câu chuyện và thông tin chung của dòng họ.</p>
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
      <main id="main-content" tabIndex={-1} className="container page news-reader-page">
        <Link className="news-back-link" href="/tin-ho">← Về Tin họ</Link>
        <article className="news-article">
          <header className="news-article-heading">
            <h1>{post.title}</h1>
            <p className="news-article-summary">{post.summary}</p>
            <div className="news-article-meta"><span>{post.category}</span><span>{post.publishedLabel}</span><span>{post.readingTime}</span></div>
          </header>
          <SafeRichText document={post.body} media={post.media} />
          <footer className="news-article-footer"><strong>Bài viết minh họa</strong><span>Nội dung này được soạn để dùng thử giao diện, không phải tư liệu lịch sử của dòng họ.</span></footer>
        </article>
      </main>
    </SiteShell>
  );
}
