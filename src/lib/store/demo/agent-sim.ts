import { parseChapter, serializeChapter } from "../../domain/chapter";
import { chapterPath } from "../../domain/paths";
import { StoreError } from "../types";
import { DEMO_AGENT, DemoStore } from "./demo-store";
import type { MiniGit } from "./minigit";

/**
 * MÔ PHỎNG AGENT (chỉ chế độ demo). Thay cho một agent thật làm việc qua repo:
 * tạo nhánh, sửa chương, mở đề xuất; hoặc sửa thẳng bản chính để thử phát hiện xung đột.
 */
const AGENT_LINE = "Một cơn gió lạnh lùa qua khe cửa, mang theo mùi tro. (agent mô phỏng)";
const agentAuthor = { name: DEMO_AGENT, email: "agent@example.invalid" };

async function editChapterText(store: DemoStore, commit: string, id: string, mode: "append" | "rewrite-first") {
  const tree = await store.getTree(commit);
  const blob = tree.get(chapterPath(id));
  if (!blob) throw new StoreError(`Không có chương ${id}`, 404);
  const doc = parseChapter(await store.readBlob(blob));
  let body: string;
  if (mode === "append") body = `${doc.body.trimEnd()}\n\n${AGENT_LINE}\n`;
  else {
    const paras = doc.body.split(/\n\n/);
    paras[0] = `${paras[0].trimEnd()} Trời bắt đầu đổ mưa. (agent sửa bản chính)`;
    body = paras.join("\n\n");
  }
  return serializeChapter({ ...doc, body });
}

export async function simulateProposal(git: MiniGit, input: { chapterIds: string[]; title?: string; touchCanon?: boolean }) {
  const store = new DemoStore(git, DEMO_AGENT);
  if (!input.chapterIds.length) throw new StoreError("Chọn ít nhất một chương", 400);
  const base = await store.getBranchHead("main");
  const branch = `agent/demo-${Date.now().toString(36)}`;
  await store.createBranch(branch, base);
  const changes: Record<string, string> = {};
  for (const id of input.chapterIds) changes[chapterPath(id)] = await editChapterText(store, base, id, "append");
  if (input.touchCanon) {
    const tree = await store.getTree(base);
    const p = "content/canon/world/kiem-tro.md";
    const b = tree.get(p);
    if (b) changes[p] = (await store.readBlob(b)).trimEnd() + "\n\n- (Đề xuất canon từ agent mô phỏng) Lưỡi kiếm ấm lên khi gần lửa.\n";
  }
  await store.commitFiles({ branch, expectedHead: base, changes, message: input.title ?? "Agent mô phỏng: chỉnh sửa chương", author: agentAuthor });
  const number = await store.createPull({
    title: input.title ?? `Agent mô phỏng: chỉnh ${input.chapterIds.length} chương`,
    body: `**Mục đích:** thử luồng review (DEMO).\n\n**Chương bị ảnh hưởng:**\n${input.chapterIds.map((id) => `- \`${id}\``).join("\n")}\n\n**Thay đổi canon:** ${input.touchCanon ? "có — thêm một chi tiết đề xuất vào Kiếm Tro (chưa chốt)" : "không"}.`,
    head: branch,
    base: "main",
    author: DEMO_AGENT,
  });
  return { number, branch };
}

export async function simulateMainEdit(git: MiniGit, chapterId: string) {
  const store = new DemoStore(git, DEMO_AGENT);
  const head = await store.getBranchHead("main");
  const text = await editChapterText(store, head, chapterId, "rewrite-first");
  return store.commitFiles({ branch: "main", expectedHead: head, changes: { [chapterPath(chapterId)]: text }, message: "Agent mô phỏng sửa trực tiếp bản chính", author: agentAuthor });
}

export async function simulatePushToProposal(git: MiniGit, number: number) {
  const store = new DemoStore(git, DEMO_AGENT);
  const pr = await store.getPull(number);
  if (pr.state !== "open") throw new StoreError("Đề xuất đã đóng", 422);
  const head = await store.getBranchHead(pr.headRef);
  const target = pr.files.find((f) => f.path.startsWith("content/chapters/"));
  if (!target) throw new StoreError("Đề xuất không có chương nào", 422);
  const id = target.path.replace(/^content\/chapters\/|\.md$/g, "");
  const tree = await store.getTree(head);
  const doc = parseChapter(await store.readBlob(tree.get(target.path)!));
  const text = serializeChapter({ ...doc, body: `${doc.body.trimEnd()}\n\nThêm một dòng sau khi đã mở review. (agent mô phỏng)\n` });
  void id;
  return store.commitFiles({ branch: pr.headRef, expectedHead: head, changes: { [target.path]: text }, message: "Agent mô phỏng: bổ sung vào đề xuất", author: agentAuthor });
}
