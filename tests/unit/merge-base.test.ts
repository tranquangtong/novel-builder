import { describe, expect, it } from "vitest";
import { MemoryStorage, MiniGit, type MgCommit } from "../../src/lib/store/demo/minigit";

/** Đếm số lần đọc đối tượng (mô phỏng số lần GET R2). */
class CountingStorage extends MemoryStorage {
  reads = 0;
  override async getObject(kind: string, sha: string) {
    this.reads++;
    return super.getObject(kind, sha);
  }
}

async function chain(git: MiniGit, from: string | null, n: number, tag: string) {
  let head = from;
  const shas: string[] = [];
  for (let i = 0; i < n; i++) {
    const c: MgCommit = await git.writeCommit({ parents: head ? [head] : [], tree: { [`f/${tag}-${i}`]: "a".repeat(40) }, message: `${tag} ${i}`, author: "t", date: new Date(Date.UTC(2026, 0, 1, 0, 0, shas.length)).toISOString() } as Omit<MgCommit, "sha">);
    head = c.sha;
    shas.push(c.sha);
  }
  return shas;
}

describe("mergeBase", () => {
  it("lịch sử dài (300 phiên bản): chỉ đọc vài commit, không duyệt cả lịch sử", async () => {
    const st = new CountingStorage();
    const w = new MiniGit(st);
    const main = await chain(w, null, 300, "main");
    const branch = await chain(w, main[289], 2, "agent"); // đề xuất tách ra từ phiên bản thứ 290
    const more = await chain(w, main[299], 3, "main2"); // bản chính đi tiếp sau đó
    const fresh = new MiniGit(st); // như một request mới: không có cache trong bộ nhớ
    st.reads = 0;
    expect(await fresh.mergeBase(more[2], branch[1])).toBe(main[289]);
    expect(st.reads).toBeLessThan(40);
  });

  it("một bên là tổ tiên của bên kia; hai bên trùng nhau; có commit merge", async () => {
    const w = new MiniGit(new MemoryStorage());
    const m = await chain(w, null, 5, "m");
    expect(await w.mergeBase(m[4], m[1])).toBe(m[1]);
    expect(await w.mergeBase(m[1], m[4])).toBe(m[1]);
    expect(await w.mergeBase(m[3], m[3])).toBe(m[3]);
    const b = await chain(w, m[2], 2, "b");
    const merge = await w.writeCommit({ parents: [m[4], b[1]], tree: {}, message: "merge", author: "t", date: new Date().toISOString() } as Omit<MgCommit, "sha">);
    const b2 = await chain(w, b[1], 1, "b2");
    expect(await w.mergeBase(merge.sha, b2[0])).toBe(b[1]);
  });
});
