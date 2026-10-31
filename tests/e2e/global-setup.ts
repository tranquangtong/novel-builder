import { request } from "@playwright/test";

/** Đưa dữ liệu demo về trạng thái ban đầu trước mỗi lần chạy. */
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: "http://localhost:3200" });
  const r = await ctx.post("/api/auth/demo", { data: { passcode: "e2e-pass" } });
  if (!r.ok()) throw new Error(`login failed ${r.status()}`);
  const reset = await ctx.post("/api/demo/reset", { data: {} });
  if (!reset.ok()) throw new Error(`reset failed ${reset.status()}`);
  await ctx.dispose();
}
