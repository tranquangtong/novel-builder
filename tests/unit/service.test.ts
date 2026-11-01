import { describe, expect, it } from "vitest";
import { freshDemo } from "./helpers";
import { ConflictError } from "@/lib/core/service";
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
    expect(snap.acts).toHaveLength(5); // Act 0 + 4 Act truyện
    expect(snap.acts[0].kind).toBe("notes");
    expect(snap.indexStale).toBe(0);
    // project.json + index.json + 5 act files
    expect(reads).toBeLessThanOrEqual(7);
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

  describe("Act 0 · Outline & Trivia", () => {
    it("moves legacy outline/canon files into Act 0 verbatim, in one commit, without renumbering chapters", async () => {
      const { svc, git } = await freshDemo();
      const before = await svc.snapshot();
      const outline = (await svc.readFile("content/outlines/act-1.md"))!.content;
      const outlineBody = outline.replace(/^---\n[\s\S]*?\n---\n/, "");
      const st = await svc.notesStatus();
      expect(st.hasAct).toBe(true);
      expect(st.legacy).toContain("content/outlines/act-1.md");
      const commitsBefore = (await git.readState()).refs.main;

      const r = await svc.setupNotesAct();
      expect(r.moved.length).toBe(st.legacy.length);
      expect(r.commitSha).not.toBe(commitsBefore);

      const after = await svc.snapshot();
      expect((await svc.notesStatus()).legacy).toEqual([]);
      expect(await svc.readFile("content/outlines/act-1.md")).toBeNull();
      expect(await svc.readFile("content/canon/world/kiem-tro.md")).toBeNull();
      // chương truyện: cùng số lượng, cùng số thứ tự, cùng blob
      const story = after.chapters.filter((c) => !c.note);
      expect(story).toHaveLength(200);
      expect(story.map((c) => [c.id, c.number, c.blob])).toEqual(before.chapters.filter((c) => !c.note).map((c) => [c.id, c.number, c.blob]));
      expect(story[0].number).toBe(1);
      // ghi chú: không đánh số, nằm trong Act 0, thân giữ nguyên văn
      const notes = after.chapters.filter((c) => c.note);
      expect(notes).toHaveLength(r.moved.length);
      expect(notes.every((c) => c.number === 0 && c.act_id === r.actId)).toBe(true);
      const moved = r.moved.find((m) => m.from === "content/outlines/act-1.md")!;
      const note = await svc.getChapter(moved.id);
      expect(note.doc.body).toBe(outlineBody);
      expect(note.doc.meta.title).toBe("Outline Act I");
      expect(note.doc.extra.note_kind).toBe("outline");
      expect(note.doc.extra.migrated_from).toBe("content/outlines/act-1.md");
      expect(note.doc.extra.related_act_id).toBeTruthy(); // act_id cũ không đè act_id mới
      expect(note.doc.extra.legacy_status).toBe("planned");
      // chạy lại: không còn gì để chuyển, không tạo commit
      const again = await svc.setupNotesAct();
      expect(again.commitSha).toBeNull();
      expect((await git.readState()).refs.main).toBe(r.commitSha);
    });

    it("creates Act 0 when missing and keeps notes out of word totals and export", async () => {
      const { svc } = await freshDemo();
      const snap = await svc.snapshot();
      // xóa Act 0 để mô phỏng kho cũ
      const act0 = snap.acts.find((a) => a.kind === "notes")!;
      await svc.commitWithChecks({ expected: {}, message: "x", build: async () => ({ [act0.path]: null }) });
      expect((await svc.notesStatus()).hasAct).toBe(false);
      const r = await svc.setupNotesAct();
      expect(r.actId).not.toBe(act0.id);
      const n = await svc.createChapter({ title: "Trivia: Kiếm Tro", act_id: r.actId });
      const after = await svc.snapshot();
      const note = after.chapters.find((c) => c.id === n.id)!;
      expect(note.note).toBe(true);
      expect(note.number).toBe(0);
      expect(after.chapters.filter((c) => !c.note).at(-1)!.number).toBe(200);
      const exp = await svc.exportManuscript();
      expect(exp.text).not.toContain("Trivia: Kiếm Tro");
      expect(exp.text).not.toContain("Act 0");
    });

    it("does not let a chapter move between Act 0 and the story acts", async () => {
      const { svc, seed } = await freshDemo();
      await svc.setupNotesAct();
      const snap = await svc.snapshot();
      const act0 = snap.acts.find((a) => a.kind === "notes")!;
      const n = await svc.createChapter({ title: "Ghi chú", act_id: act0.id });
      const v = await svc.getChapter(n.id);
      await expect(svc.saveChapter(n.id, { meta: { ...v.doc.meta, act_id: seed.actIds[0] }, body: "x", baseBlob: v.blob })).rejects.toThrow(/Act 0/);
      const ch = await svc.getChapter(seed.chapterIds[0]);
      await expect(svc.saveChapter(ch.doc.meta.id, { meta: { ...ch.doc.meta, act_id: act0.id }, body: "x", baseBlob: ch.blob })).rejects.toThrow(/Act 0/);
    });
  });
});
