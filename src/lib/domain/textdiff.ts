import { diffArrays, diffWordsWithSpace } from "diff";

export type Seg = { text: string; kind: "same" | "add" | "del" };
export type DiffBlock =
  | { kind: "same"; text: string }
  | { kind: "add"; text: string }
  | { kind: "del"; text: string }
  | { kind: "change"; before: string; after: string; segs: Seg[] };

/** Tách theo đoạn (ngăn bởi dòng trống). Mỗi dòng không trống liền nhau thuộc cùng một đoạn. */
export function splitParagraphs(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\s+$/g, "")).filter((p) => p.length > 0);
}

/**
 * Diff theo đoạn; đoạn bị sửa được ghép cặp (xóa + thêm liền nhau) và tô sáng
 * từng từ thay đổi bên trong.
 */
export function paragraphDiff(before: string, after: string): DiffBlock[] {
  const a = splitParagraphs(before);
  const b = splitParagraphs(after);
  const parts = diffArrays(a, b);
  const out: DiffBlock[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      for (const t of p.value) out.push({ kind: "same", text: t });
      continue;
    }
    const next = parts[i + 1];
    if (p.removed && next?.added) {
      const n = Math.min(p.value.length, next.value.length);
      for (let k = 0; k < n; k++) {
        const segs = diffWordsWithSpace(p.value[k], next.value[k]).map((s) => ({ text: s.value, kind: s.added ? "add" : s.removed ? "del" : "same" }) as Seg);
        out.push({ kind: "change", before: p.value[k], after: next.value[k], segs });
      }
      for (const t of p.value.slice(n)) out.push({ kind: "del", text: t });
      for (const t of next.value.slice(n)) out.push({ kind: "add", text: t });
      i++;
      continue;
    }
    for (const t of p.value) out.push({ kind: p.added ? "add" : "del", text: t });
  }
  return out;
}

export function diffStats(blocks: DiffBlock[]) {
  let added = 0, removed = 0, changed = 0, same = 0;
  for (const b of blocks) {
    if (b.kind === "add") added++;
    else if (b.kind === "del") removed++;
    else if (b.kind === "change") changed++;
    else same++;
  }
  return { added, removed, changed, same };
}
