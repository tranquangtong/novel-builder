import { describe, expect, it } from "vitest";
import { freshDemo } from "./helpers";
import { ConflictError } from "@/lib/server/service";
import { chapterPath } from "@/lib/domain/paths";
import { simulateMainEdit, simulateProposal, simulatePushToProposal } from "@/lib/store/demo/agent-sim";
import { HeadChangedError } from "@/lib/store/types";

describe("ManuscriptService (demo store)", () => {
  it("lists 200 chapters without reading chapter bodies", async () => {
    const { svc, store } = await freshDemo();
    let reads = 0;
    const orig = store.readBlob.bind(store);
    store.readBlob = async (s: string) => { reads++; return orig(s); };
    const snap = await svc.snapshot();
    expect(snap.chapters).toHaveLength(200);
    expect(snap.acts).toHaveLength(4);
    expect(snap.indexStale).toBe(0);
    // project.json + index.json + 4 act files
    expect(reads).toBeLessThanOrEqual(6);
    expect(snap.chapters[9].number).toBe(10);
    expect(JSON.stringify(snap.chapters)).not.toContain("Mưa không ngừng");
  });

  it("saves a version with Vietnamese text and keeps the id on rename/move", async () => {
    const { svc, seed } = await freshDemo();
    const id = seed.chapterIds[4];
    const v = await svc.getChapter(id);
    const body = "Đêm ấy, Puna thức trắng — cô nghĩ về lời hứa với Ben.\n\n“Ừ,” Rei đáp khẽ.\n";
    const res = await svc.saveChapter(id, { meta: { ...v.doc.meta, title: "Tên mới hoàn toàn", act_id: seed.actIds[1] }, body, baseBlob: v.blob });
    const v2 = await svc.getChapter(id);
    expect(v2.doc.body).toBe(body);
    expect(v2.doc.meta.id).toBe(id);
    expect(v2.path).toBe(chapterPath(id));
    expect(v2.doc.meta.title).toBe("Tên mới hoàn toàn");
    expect(v2.blob).toBe(res.blob);
    const snap = await svc.snapshot();
    expect(snap.indexStale).toBe(0);
    expect(snap.chapters.find((c) => c.id === id)?.act_id).toBe(seed.actIds[1]);
  });

  it("rejects a save based on an outdated version and keeps server content", async () => {
    const { svc, seed, git } = await freshDemo();
    const id = seed.chapterIds[20];
    const v = await svc.getChapter(id);
    await simulateMainEdit(git, id); // agent sửa bên ngoài
    await expect(svc.saveChapter(id, { meta: v.doc.meta, body: "nháp của tác giả", baseBlob: v.blob })).rejects.toBeInstanceOf(ConflictError);
    const after = await svc.getChapter(id);
    expect(after.doc.body).toContain("agent sửa bản chính");
  });

  it("retries when another file changed concurrently (no false conflict)", async () => {
    const { svc, seed, git } = await freshDemo();
    const a = seed.chapterIds[30], b = seed.chapterIds[31];
    const va = await svc.getChapter(a);
    await simulateMainEdit(git, b);
    await svc.saveChapter(a, { meta: va.doc.meta, body: "mới\n", baseBlob: va.blob });
    expect((await svc.getChapter(a)).doc.body).toBe("mới\n");
    expect((await svc.getChapter(b)).doc.body).toContain("agent sửa bản chính");
  });

  it("restores Ch10–11 to an old version while keeping Ch8–9 and canon edits", async () => {
    const { svc, seed } = await freshDemo();
    const [c8, c9, c10, c11] = [7, 8, 9, 10].map((i) => seed.chapterIds[i]);
    const before8 = (await svc.getChapter(c8)).doc.body;
    const before9 = (await svc.getChapter(c9)).doc.body;
    const canon = (await svc.readFile("content/canon/world/kiem-tro.md"))!.content;
    expect(canon).toContain("Chuôi quấn da");
    const cur10 = await svc.getChapter(c10), cur11 = await svc.getChapter(c11);
    const old10 = await svc.getChapter(c10, seed.commits.init);
    expect(cur10.doc.body).not.toBe(old10.doc.body);
    await svc.restoreChapters({ fromCommit: seed.commits.init, chapterIds: [c10, c11], current: { [c10]: cur10.blob, [c11]: cur11.blob }, keepMeta: true });
    expect((await svc.getChapter(c10)).doc.body).toBe(old10.doc.body);
    expect((await svc.getChapter(c11)).doc.body).toBe((await svc.getChapter(c11, seed.commits.init)).doc.body);
    expect((await svc.getChapter(c8)).doc.body).toBe(before8);
    expect((await svc.getChapter(c9)).doc.body).toBe(before9);
    expect((await svc.readFile("content/canon/world/kiem-tro.md"))!.content).toBe(canon);
    // lịch sử không bị viết lại: commit cũ vẫn còn
    const hist = await svc.chapterHistory(c10);
    expect(hist.length).toBeGreaterThanOrEqual(3);
  });

  it("merges a proposal only if the head did not change", async () => {
    const { svc, seed, git, store } = await freshDemo();
    const id = seed.chapterIds[40];
    const { number } = await simulateProposal(git, { chapterIds: [id] });
    const pr = await store.getPull(number);
    expect(pr.mergeable).toBe(true);
    await simulatePushToProposal(git, number);
    await expect(store.mergePull(number, pr.headSha, "merge")).rejects.toBeInstanceOf(HeadChangedError);
    const pr2 = await store.getPull(number);
    await store.mergePull(number, pr2.headSha, "merge");
    expect((await svc.getChapter(id)).doc.body).toContain("agent mô phỏng");
    expect((await store.getPull(number)).state).toBe("merged");
  });

  it("detects conflicts when author and agent edit the same chapter", async () => {
    const { svc, seed, git, store } = await freshDemo();
    const id = seed.chapterIds[50];
    const { number } = await simulateProposal(git, { chapterIds: [id] });
    const v = await svc.getChapter(id);
    await svc.saveChapter(id, { meta: v.doc.meta, body: "Tác giả viết lại toàn bộ.\n", baseBlob: v.blob });
    const pr = await store.getPull(number);
    expect(pr.mergeable).toBe(false);
    expect(pr.conflictFiles).toContain(chapterPath(id));
    await expect(store.mergePull(number, pr.headSha, "m")).rejects.toThrow(/Xung đột/);
  });

  it("refuses self-approval like GitHub", async () => {
    const { git } = await freshDemo();
    const { DemoStore, DEMO_AGENT } = await import("@/lib/store/demo/demo-store");
    const agent = new DemoStore(git, DEMO_AGENT);
    await expect(agent.reviewPull(1, "APPROVE", "ok")).rejects.toThrow(/tự approve/);
  });
});
