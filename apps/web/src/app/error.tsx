"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main-content" tabIndex={-1} className="container page"><div className="card" role="alert"><h1>Chưa tải được nội dung</h1><p>Hãy thử lại. Nếu vẫn gặp lỗi, liên hệ người phụ trách gia phả.</p><button className="button-primary" type="button" onClick={() => reset()}>Thử lại</button></div></main>;
}
