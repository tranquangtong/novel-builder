import { defineConfig } from "@playwright/test";

/**
 * E2E chế độ Cloudflare: Worker chạy trên workerd (wrangler dev) với R2/D1 local.
 * Cần build trước KHÔNG có basePath: NEXT_PUBLIC_BASE_PATH= npm run build
 * Access được bỏ qua bằng DEV_AUTH_EMAIL (chỉ có hiệu lực với host localhost).
 */
const PORT = 8788;
const P = ".wrangler/e2e";
export default defineConfig({
  testDir: "tests/e2e-cloud",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `rm -rf ${P} && npx wrangler d1 migrations apply novel-builder --local --persist-to ${P} && npx wrangler dev --port ${PORT} --ip 127.0.0.1 --persist-to ${P} --var DEV_AUTH_EMAIL:tac-gia@example.com --var EDITOR_EMAILS:tac-gia@example.com`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
