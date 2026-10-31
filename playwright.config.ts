import { defineConfig } from "@playwright/test";

const PORT = 3200;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "/novel-builder";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  webServer: {
    // Phục vụ bản xuất tĩnh (out/) giống GitHub Pages, với basePath /novel-builder.
    // Cần build trước: NEXT_PUBLIC_BASE_PATH=/novel-builder npm run build
    command: `node scripts/serve-static.mjs ${PORT} ${BASE}`,
    url: `http://localhost:${PORT}${BASE}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
