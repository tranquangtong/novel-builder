import { serializeChapter } from "../domain/chapter";
import { serializeFrontmatter } from "../domain/frontmatter";
import { isValidId, newId } from "../domain/ids";
import { actPath, chapterPath } from "../domain/paths";
import { ValidationError, type Author, type ManuscriptService } from "./service";

export interface ImportItem {
  title: string;
  body: string;
  pov?: string;
  /** act_id có sẵn, hoặc "new:<key>" trỏ tới newActs */
  act: string;
  action: "new" | "replace";
  /** bắt buộc khi action = replace */
  replaceId?: string;
  replaceBlob?: string;
  /** dùng lại id từ frontmatter (file xuất từ ứng dụng) nếu chưa tồn tại */
  keepId?: string;
}

export async function importChapters(svc: ManuscriptService, input: { items: ImportItem[]; newActs?: { key: string; title: string }[]; sourceName?: string }, author?: Author) {
  const items = input.items ?? [];
  if (!items.length) throw new ValidationError("Không có chương nào được chọn để nhập");
  if (items.length > 500) throw new ValidationError("Tối đa 500 chương mỗi lần nhập");
  const snap = await svc.snapshot();
  const actIds = new Set(snap.acts.map((a) => a.id));
  const newActs = new Map<string, { id: string; title: string; order: number }>();
  let actOrder = (snap.acts.at(-1)?.order ?? 0) + 1;
  for (const a of input.newActs ?? []) {
    if (!a.title?.trim()) throw new ValidationError("Act mới cần tên");
    newActs.set(a.key, { id: newId("act"), title: a.title.trim(), order: actOrder++ });
  }
  const resolveAct = (act: string) => {
    if (act.startsWith("new:")) {
      const a = newActs.get(act.slice(4));
      if (!a) throw new ValidationError(`Act mới “${act}” không được khai báo`);
      return a.id;
    }
    if (!actIds.has(act)) throw new ValidationError(`Act ${act} không tồn tại`);
    if (snap.acts.find((a) => a.id === act)?.kind === "notes") throw new ValidationError("Không nhập chương truyện vào Act 0 (ghi chú)");
    return act;
  };

  const existingIds = new Set(snap.chapters.map((c) => c.id));
  const usedIds = new Set<string>();
  const expected: Record<string, string | null> = {};
  const plan: { id: string; path: string; item: ImportItem; act: string }[] = [];
  for (const item of items) {
    if (typeof item.body !== "string" || typeof item.title !== "string") throw new ValidationError("Dữ liệu chương không hợp lệ");
    if (!item.title.trim()) throw new ValidationError("Có chương thiếu tiêu đề — hãy đặt tên ở bước xem trước");
    const act = resolveAct(item.act);
    let id: string;
    if (item.action === "replace") {
      if (!item.replaceId || !existingIds.has(item.replaceId) || !item.replaceBlob) throw new ValidationError("Ghi đè cần chương đích và phiên bản hiện tại");
      id = item.replaceId;
      expected[chapterPath(id)] = item.replaceBlob;
    } else {
      if (item.keepId) {
        if (!isValidId(item.keepId)) throw new ValidationError(`ID ${item.keepId} không hợp lệ`);
        if (existingIds.has(item.keepId)) throw new ValidationError(`ID ${item.keepId} đã tồn tại — chọn “Ghi đè” hoặc nhập thành chương mới với ID mới`);
        id = item.keepId;
      } else id = newId("ch");
      expected[chapterPath(id)] = null;
    }
    if (usedIds.has(id)) throw new ValidationError(`ID ${id} bị dùng hai lần trong cùng lần nhập`);
    usedIds.add(id);
    plan.push({ id, path: chapterPath(id), item, act });
  }

  // Thứ tự: chương mới được thêm vào cuối Act đích, theo đúng thứ tự trong file.
  const lastOrderInAct = new Map<string, number>();
  const story = snap.chapters.filter((c) => !c.note); // ghi chú Act 0 có thứ tự riêng
  const maxOrder = story.at(-1)?.order ?? 0;
  for (const c of story) lastOrderInAct.set(c.act_id, c.order);
  const nextOrder = (act: string) => {
    const idx = story.findIndex((c) => c.order > (lastOrderInAct.get(act) ?? Infinity));
    const last = lastOrderInAct.get(act);
    let o: number;
    if (last === undefined) o = maxOrder + 1 + plan.length; // Act chưa có chương: thêm cuối bản thảo
    else if (idx === -1) o = last + 1;
    else o = (last + story[idx].order) / 2;
    lastOrderInAct.set(act, o);
    return o;
  };

  const res = await svc.commitWithChecks({
    expected,
    author,
    message: `Nhập ${plan.length} chương${input.sourceName ? ` từ ${input.sourceName}` : ""}\n\nNội dung được nhập nguyên văn (chỉ chuẩn hóa xuống dòng CRLF → LF).`,
    build: async ({ tree }) => {
      const changes: Record<string, string> = {};
      for (const a of newActs.values()) changes[actPath(a.id)] = serializeFrontmatter({ id: a.id, title: a.title, order: a.order }, "\n");
      for (const p of plan) {
        if (p.item.action === "replace") {
          const cur = await svc.getChapter(p.id);
          void tree;
          changes[p.path] = serializeChapter({ ...cur.doc, meta: { ...cur.doc.meta, title: p.item.title.trim() }, body: p.item.body });
        } else {
          changes[p.path] = serializeChapter({ meta: { id: p.id, title: p.item.title.trim(), act_id: p.act, order: nextOrder(p.act), status: "draft", pov: p.item.pov || undefined }, body: p.item.body, extra: {} });
        }
      }
      return changes;
    },
  });
  return { commitSha: res.commitSha, ids: plan.map((p) => p.id) };
}
