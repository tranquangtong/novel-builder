import { describe, expect, it } from "vitest";
import { GitHubStore } from "@/lib/store/github/github-store";
import { ManuscriptService, ConflictError } from "@/lib/core/service";
import { HeadChangedError, NotMergeableError } from "@/lib/store/types";
import { chapterPath } from "@/lib/domain/paths";
import { freshDemo } from "./helpers";
import { fakeGitHub, FAKE_TOKEN, FAKE_LOGIN } from "../support/fake-github";

async function setup() {
  const demo = await freshDemo();
  const fake = fakeGitHub(demo.git);
  const store = new GitHubStore({ token: FAKE_TOKEN, owner: "o", repo: "r", branch: "main", fetch: fake.fetch as typeof fetch, baseUrl: "https://api.github.test" });
  return { ...demo, fake, gh: store, svc: new ManuscriptService(store) };
}

describe("GitHubStore với GitHub API giả", () => {
  it("đọc danh sách chương từ chỉ mục, không đọc thân chương", async () => {
    const { svc, fake } = await setup();
    const snap = await svc.snapshot();
    expect(snap.chapters).toHaveLength(200);
    expect(fake.calls.filter((c) => c.path.includes("/git/blobs/")).length).toBeLessThanOrEqual(6);
    expect(fake.calls.every((c) => c.auth === `token ${FAKE_TOKEN}`)).toBe(true);
  });

  it("lưu phiên bản bằng 1 commit (tree → commit → PATCH ref force=false)", async () => {
    const { svc, seed, fake, git } = await setup();
    const id = seed.chapterIds[3];
    const v = await svc.getChapter(id);
    fake.calls.length = 0;
    const r = await svc.saveChapter(id, { meta: v.doc.meta, body: "Nội dung mới — tiếng Việt.\n", baseBlob: v.blob });
    const writes = fake.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);
    expect(writes).toEqual(["POST /repos/o/r/git/trees", "POST /repos/o/r/git/commits", "PATCH /repos/o/r/git/refs/heads/main"]);
    expect((await git.readState()).refs.main).toBe(r.commitSha);
    const tree = (await git.readCommit(r.commitSha)).tree;
    expect(await git.readBlob(tree[chapterPath(id)])).toContain("Nội dung mới — tiếng Việt.");
    expect(await git.readBlob(tree["content/index.json"])).toContain(r.blob);
  });

  it("nhánh đi tiếp trong lúc lưu (422) → thử lại; file đã đổi → ConflictError", async () => {
    const { svc, seed, git, gh } = await setup();
    const a = seed.chapterIds[60], b = seed.chapterIds[61];
    const va = await svc.getChapter(a);
    // một commit khác chen vào giữa (sửa chương b)
    const head = (await git.readState()).refs.main;
    const orig = gh.commitFiles.bind(gh);
    let injected = false;
    gh.commitFiles = async (input) => {
      if (!injected) {
        injected = true;
        const c = await git.writeCommit({ tree: { ...(await git.readCommit(head)).tree, [chapterPath(b)]: await git.writeBlob("x") }, parents: [head], message: "chen", author: "agent", date: new Date().toISOString() });
        const s = await git.readState();
        s.refs.main = c.sha;
        await git.writeState(s);
      }
      return orig(input);
    };
    await svc.saveChapter(a, { meta: va.doc.meta, body: "A mới\n", baseBlob: va.blob });
    expect(injected).toBe(true);
    expect((await svc.getChapter(a)).doc.body).toBe("A mới\n");
    expect(await git.readBlob((await git.readCommit((await git.readState()).refs.main)).tree[chapterPath(b)])).toBe("x");
    await expect(svc.saveChapter(a, { meta: va.doc.meta, body: "dựa trên bản cũ\n", baseBlob: va.blob })).rejects.toBeInstanceOf(ConflictError);
  });

  it("merge: 409 → HeadChangedError, 405 → NotMergeableError", async () => {
    const { gh, fake } = await setup();
    fake.setMerge("a".repeat(40), true);
    await expect(gh.mergePull(1, "b".repeat(40), "m")).rejects.toBeInstanceOf(HeadChangedError);
    fake.setMerge("a".repeat(40), false);
    await expect(gh.mergePull(1, "a".repeat(40), "m")).rejects.toBeInstanceOf(NotMergeableError);
    fake.setMerge("a".repeat(40), true);
    await expect(gh.mergePull(1, "a".repeat(40), "m")).resolves.toEqual({ sha: "f".repeat(40) });
  });

  it("danh tính lấy từ GET /user của token", async () => {
    const { gh } = await setup();
    expect(await gh.actorLogin()).toBe(FAKE_LOGIN);
  });
});

describe("GitHubStore: lỗi mạng/máy chủ", () => {
  it("lỗi 502 khi tạo commit → ném lỗi, nhánh không đổi", async () => {
    const { svc, seed, fake, git } = await setup();
    const id = seed.chapterIds[5];
    const v = await svc.getChapter(id);
    const before = (await git.readState()).refs.main;
    fake.failNext("POST", /\/git\/commits$/, 502);
    await expect(svc.saveChapter(id, { meta: v.doc.meta, body: "x\n", baseBlob: v.blob })).rejects.toThrow(/502/);
    expect((await git.readState()).refs.main).toBe(before);
  });
  it("token sai → 401", async () => {
    const { git } = await setup();
    const fake = fakeGitHub(git);
    const bad = new GitHubStore({ token: "sai", owner: "o", repo: "r", branch: "main", fetch: fake.fetch as typeof fetch, baseUrl: "https://api.github.test" });
    await expect(bad.getBranchHead("main")).rejects.toMatchObject({ status: 401 });
  });
});
