import fs from "node:fs";
import { guarded, json } from "@/lib/server/api";
import { getConfig } from "@/lib/server/config";
import { demoGit, getStore } from "@/lib/server/store";

/** Xóa và tạo lại dữ liệu demo. Không bao giờ chạy ở chế độ GitHub. */
export const POST = guarded(async () => {
  if (getConfig().mode !== "demo") return json({ error: "Chỉ có ở chế độ demo" }, 404);
  const git = demoGit();
  await git.withLock(() => {
    for (const f of fs.readdirSync(git.dir)) if (f !== ".lock") fs.rmSync(`${git.dir}/${f}`, { recursive: true, force: true });
  });
  await getStore();
  return json({ ok: true });
});
