import { body, guarded, json } from "@/lib/server/api";
import { getConfig } from "@/lib/server/config";
import { getStore, demoGit } from "@/lib/server/store";
import { simulateMainEdit, simulateProposal, simulatePushToProposal } from "@/lib/store/demo/agent-sim";
import { ValidationError } from "@/lib/server/service";

/** MÔ PHỎNG AGENT — chỉ tồn tại ở chế độ demo. */
export const POST = guarded(async (req) => {
  if (getConfig().mode !== "demo") return json({ error: "Chỉ có ở chế độ demo" }, 404);
  await getStore();
  const b = await body<{ action: string; chapterIds?: string[]; chapterId?: string; number?: number; touchCanon?: boolean; title?: string }>(req);
  const git = demoGit();
  if (b.action === "propose") return json(await simulateProposal(git, { chapterIds: b.chapterIds ?? [], touchCanon: b.touchCanon, title: b.title }));
  if (b.action === "edit-main") {
    if (!b.chapterId) throw new ValidationError("Thiếu chương");
    return json(await simulateMainEdit(git, b.chapterId));
  }
  if (b.action === "push-to-proposal") return json(await simulatePushToProposal(git, Number(b.number)));
  throw new ValidationError("Hành động không hợp lệ");
});
