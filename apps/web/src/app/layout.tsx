import type { Metadata } from "next";
import "@fontsource-variable/noto-sans/wght.css";
import "@fontsource-variable/noto-serif/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phan Gia Phả",
  description: "Gìn giữ nguồn cội — Kết nối các thế hệ",
  icons: { icon: "/assets/logo-mark.png" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
