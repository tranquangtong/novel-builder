import type { Metadata } from "next";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/600.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Novel Builder",
  description: "Công cụ viết riêng tư",
  robots: { index: false, follow: false },
};

// Đăng nhập Google qua Firebase (chỉ bản Cloudflare có cấu hình): theo mã nguồn firebase-js-sdk,
// popup nạp https://apis.google.com/js/api.js, iframe <authDomain>/__/auth/iframe và gọi
// identitytoolkit.googleapis.com + securetoken.googleapis.com.
const FB_DOMAIN = process.env.NEXT_PUBLIC_TARGET === "cloudflare" && process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "").replace(/[^a-z0-9.-]/gi, "") : "";
const FB = FB_DOMAIN ? { script: " https://apis.google.com", connect: " https://identitytoolkit.googleapis.com https://securetoken.googleapis.com", frame: ` https://${FB_DOMAIN}` } : { script: "", connect: "", frame: "" };

const CSP = [
  "default-src 'self'",
  `connect-src 'self' https://api.github.com${FB.connect}`,
  // Next.js xuất tĩnh cần script inline cho dữ liệu khởi tạo trang
  `script-src 'self' 'unsafe-inline'${FB.script}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `frame-src ${FB_DOMAIN ? FB.frame.trim() : "'none'"}`,
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
