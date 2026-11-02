import type { Metadata } from "next";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/400-italic.css";
import "@fontsource/be-vietnam-pro/600-italic.css";
import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/600.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "The Last Miracle · Xưởng viết",
  description: "Công cụ viết riêng tư",
  robots: { index: false, follow: false },
};

const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://api.github.com",
  // Next.js xuất tĩnh cần script inline cho dữ liệu khởi tạo trang
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        {/* Chỉ cho phép kết nối tới chính trang và api.github.com — token không thể bị gửi đi nơi khác. */}
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="no-referrer" />
        {/* Chỉ dùng giao diện sáng (kể cả khi máy đặt chế độ tối). */}
        <meta name="color-scheme" content="light only" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
