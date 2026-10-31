import { defineConfig } from "@playwright/test";

const PORT = 3200;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  webServer: {
    // Chạy bản build production ở CHẾ ĐỘ DEMO với thư mục dữ liệu riêng cho test.
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    env: { DATA_MODE: "demo", DEMO_DATA_DIR: ".e2e-demo-data", DEMO_PASSCODE: "e2e-pass", NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 60_000,
  },
});
