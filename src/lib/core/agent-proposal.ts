import { assertSafeContentPath, INDEX_FILE } from "../domain/paths";
import { DemoStore } from "../store/demo/demo-store";
import { ValidationError } from "./service";

/**
 * Agent (service token) đề xuất thay đổi: tạo nhánh từ bản chính (hoặc từ baseCommit),
 * ghi MỘT commit với các file được gửi, rồi mở đề xuất. Không bao giờ ghi thẳng bản chính.
 */
export async function createAgentProposal(store: DemoStore, agentName: string, input: { title?: string; body?: string; changes?: Record<string, string | null>; baseCommit?: string; branch?: string }) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new ValidationError("Đề xuất cần tiêu đề");
  const changes = input.changes ?? {};
  const paths = Object.keys(changes);
  if (!paths.length) throw new ValidationError("Đề xuất không có thay đổi nào");
  if (paths.length > 300) throw new ValidationError("Tối đa 300 file mỗi đề xuất");
  for (const p of paths) {
    if (p !== "AGENTS.md") assertSafeContentPath(p);
    if (p === INDEX_FILE) throw new ValidationError("Không sửa content/index.json (file tự sinh)");
    const v = changes[p];
    if (v !== null && typeof v !== "string") throw new ValidationError(`Nội dung ${p} không hợp lệ`);
  }
  const base = input.baseCommit && /^[0-9a-f]{40}$/.test(input.baseCommit) ? input.baseCommit : await store.getBranchHead(store.defaultBranch);
  const slug = (input.branch ?? title).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "de-xuat";
  const branch = `agent/${slug}-${Date.now().toString(36)}`;
  await store.createBranch(branch, base);
  const { commitSha } = await store.commitFiles({ branch, expectedHead: base, changes, message: title, author: { name: agentName, email: `${agentName}@agent.invalid` } });
  const number = await store.createPull({ title, body: String(input.body ?? ""), head: branch, base: store.defaultBranch, author: agentName });
  return { number, branch, commitSha };
}
