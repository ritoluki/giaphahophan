"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="container page"><div className="card"><h1>Không thể tải nội dung</h1><p>Hãy thử lại. Nếu lỗi tiếp tục, cung cấp mã yêu cầu từ màn hình cho người phụ trách.</p><button className="button-primary" type="button" onClick={() => reset()}>Thử lại</button></div></main>;
}
