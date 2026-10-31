import { guarded, json } from "@/lib/server/api";
import { getStore } from "@/lib/server/store";
import { GitHubStore } from "@/lib/store/github/github-store";

/** Kiểm tra kết nối GitHub THẬT, trả kết quả từng bước. */
export const POST = guarded(async () => {
  const store = await getStore();
  if (!(store instanceof GitHubStore)) return json({ mode: "demo", steps: [{ step: "Chế độ demo", ok: true, detail: "Không kết nối GitHub — dữ liệu nằm trong .demo-data trên máy chủ này" }] });
  return json({ mode: "github", steps: await store.diagnose() });
});
