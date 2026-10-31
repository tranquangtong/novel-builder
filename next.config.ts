import type { NextConfig } from "next";

/**
 * Xuất tĩnh cho GitHub Pages. Build KHÔNG chứa bản thảo: mọi nội dung được trình duyệt
 * tải trực tiếp từ repo private qua api.github.com bằng token của tác giả, lúc đang dùng.
 * NEXT_PUBLIC_BASE_PATH = "/<tên-repo>" khi chạy ở https://<user>.github.io/<tên-repo>/.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
