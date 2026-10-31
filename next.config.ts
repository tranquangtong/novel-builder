import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bản thảo private không bao giờ được đưa vào build tĩnh: mọi nội dung đều
  // được đọc lúc chạy qua API có kiểm tra phiên đăng nhập.
  // AGENTS.md mẫu được đọc lúc chạy (khởi tạo repo / dữ liệu demo).
  outputFileTracingIncludes: { "/api/**": ["./templates/**"], "/": ["./templates/**"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
