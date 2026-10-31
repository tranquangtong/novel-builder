import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { GitHubStore } from "@/lib/store/github/github-store";
import { ManuscriptService, ConflictError } from "@/lib/server/service";
import { HeadChangedError, NotMergeableError } from "@/lib/store/types";
import { chapterPath } from "@/lib/domain/paths";
import { freshDemo } from "./helpers";
import type { MiniGit } from "@/lib/store/demo/minigit";

/**
 * GitHub API GIẢ, dựng trên mini-git, mô phỏng đúng các hành vi đã ghi trong đặc tả
 * OpenAPI chính thức: PATCH ref với force=false trả 422 khi không fast-forward;
 * PUT merge với sha khác head trả 409. KHÔNG thay thế việc kiểm thử với GitHub thật.
 */
function fakeGitHub(git: MiniGit) {
  const trees = new Map<string, Record<string, string>>();
  const calls: string[] = [];
  let mergeHead = "";
  let mergeable: boolean | null = true;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const p = decodeURIComponent(url.pathname);
    calls.push(`${method} ${p}`);
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    let m: RegExpExecArray | null;
    if (method === "POST" && (m = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(p))) {
      expect(auth).toMatch(/^bearer ey/i); // JWT của app
      return json(201, { token: "ghs_fake", expires_at: new Date(Date.now() + 3600e3).toISOString(), permissions: { contents: "write", pull_requests: "write", metadata: "read" }, repository_selection: "selected" });
    }
    if (method === "GET" && p === "/app") return json(200, { slug: "the-last-miracle-studio" });
    expect(auth.toLowerCase()).toBe("token ghs_fake");
    const R = "/repos/o/r";
    if (method === "GET" && (m = new RegExp(`^${R}/git/ref/heads/(.+)$`).exec(p))) {
      const sha = git.readState().refs[m[1]];
      return sha ? json(200, { ref: `refs/heads/${m[1]}`, object: { sha, type: "commit" } }) : json(404, { message: "Not Found" });
    }
    if (method === "GET" && (m = new RegExp(`^${R}/git/commits/([0-9a-f]{40})$`).exec(p))) {
      const c = git.readCommit(m[1]);
      trees.set(`tree-${c.sha}`, c.tree);
      return json(200, { sha: c.sha, tree: { sha: `tree-${c.sha}` }, parents: c.parents.map((s) => ({ sha: s })) });
    }
    if (method === "GET" && (m = new RegExp(`^${R}/git/trees/([^/]+)$`).exec(p))) {
      expect(url.searchParams.get("recursive")).toBeTruthy();
      const t = trees.get(m[1])!;
      return json(200, { sha: m[1], truncated: false, tree: Object.entries(t).map(([path, sha]) => ({ path, sha, type: "blob", mode: "100644" })) });
    }
    if (method === "GET" && (m = new RegExp(`^${R}/git/blobs/([0-9a-f]{40})$`).exec(p))) {
      return json(200, { sha: m[1], encoding: "base64", content: Buffer.from(git.readBlob(m[1]), "utf8").toString("base64") });
    }
    if (method === "POST" && p === `${R}/git/trees`) {
      const base = { ...trees.get(body.base_tree)! };
      for (const e of body.tree) {
        if (e.sha === null) delete base[e.path];
        else base[e.path] = git.writeBlob(e.content);
      }
      const id = `tree-new-${trees.size}`;
      trees.set(id, base);
      return json(201, { sha: id });
    }
    if (method === "POST" && p === `${R}/git/commits`) {
      const c = git.writeCommit({ tree: trees.get(body.tree)!, parents: body.parents, message: body.message, author: body.author?.name ?? "app", date: new Date().toISOString() });
      return json(201, { sha: c.sha });
    }
    if (method === "PATCH" && (m = new RegExp(`^${R}/git/refs/heads/(.+)$`).exec(p))) {
      expect(body.force).toBe(false);
      const s = git.readState();
      const c = git.readCommit(body.sha);
      if (!c.parents.includes(s.refs[m[1]])) return json(422, { message: "Update is not a fast forward" });
      s.refs[m[1]] = body.sha;
      git.writeState(s);
      return json(200, { object: { sha: body.sha } });
    }
    if (method === "PUT" && (m = new RegExp(`^${R}/pulls/(\\d+)/merge$`).exec(p))) {
      if (body.sha !== mergeHead) return json(409, { message: "Head branch was modified. Review and try the merge again." });
      if (!mergeable) return json(405, { message: "Pull Request is not mergeable" });
      return json(200, { sha: "f".repeat(40), merged: true });
    }
    return json(404, { message: `fake: ${method} ${p} chưa hỗ trợ` });
  };
  return { fetchImpl, calls, setMerge: (h: string, ok: boolean | null) => ((mergeHead = h), (mergeable = ok)) };
}

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

async function setup() {
  const demo = await freshDemo();
  const fake = fakeGitHub(demo.git);
  const store = new GitHubStore({ appId: "1", privateKey, installationId: "42", owner: "o", repo: "r", branch: "main", fetch: fake.fetchImpl as typeof fetch, baseUrl: "https://api.github.test" });
  return { ...demo, fake, gh: store, svc: new ManuscriptService(store) };
}

describe("GitHubStore với GitHub API giả", () => {
  it("đọc danh sách chương từ chỉ mục, không đọc thân chương (khóa PKCS#1 được chấp nhận)", async () => {
    const { svc, fake } = await setup();
    const snap = await svc.snapshot();
    expect(snap.chapters).toHaveLength(200);
    expect(fake.calls.filter((c) => c.includes("/git/blobs/")).length).toBeLessThanOrEqual(6);
  });

  it("lưu phiên bản bằng 1 commit (tree → commit → PATCH ref force=false)", async () => {
    const { svc, seed, fake, git } = await setup();
    const id = seed.chapterIds[3];
    const v = await svc.getChapter(id);
    fake.calls.length = 0;
    const r = await svc.saveChapter(id, { meta: v.doc.meta, body: "Nội dung mới — tiếng Việt.\n", baseBlob: v.blob });
    const writes = fake.calls.filter((c) => !c.startsWith("GET"));
    expect(writes).toEqual(["POST /repos/o/r/git/trees", "POST /repos/o/r/git/commits", "PATCH /repos/o/r/git/refs/heads/main"]);
    expect(git.readState().refs.main).toBe(r.commitSha);
    const tree = git.readCommit(r.commitSha).tree;
    expect(git.readBlob(tree[chapterPath(id)])).toContain("Nội dung mới — tiếng Việt.");
    expect(git.readBlob(tree["content/index.json"])).toContain(r.blob);
  });

  it("nhánh đi tiếp trong lúc lưu (422) → thử lại; file đã đổi → ConflictError", async () => {
    const { svc, seed, git, gh } = await setup();
    const a = seed.chapterIds[60], b = seed.chapterIds[61];
    const va = await svc.getChapter(a);
    // một commit khác chen vào giữa (sửa chương b)
    const head = git.readState().refs.main;
    const orig = gh.commitFiles.bind(gh);
    let injected = false;
    gh.commitFiles = async (input) => {
      if (!injected) {
        injected = true;
        const c = git.writeCommit({ tree: { ...git.readCommit(head).tree, [chapterPath(b)]: git.writeBlob("x") }, parents: [head], message: "chen", author: "agent", date: new Date().toISOString() });
        const s = git.readState();
        s.refs.main = c.sha;
        git.writeState(s);
      }
      return orig(input);
    };
    await svc.saveChapter(a, { meta: va.doc.meta, body: "A mới\n", baseBlob: va.blob });
    expect(injected).toBe(true);
    expect((await svc.getChapter(a)).doc.body).toBe("A mới\n");
    expect(git.readBlob(git.readCommit(git.readState().refs.main).tree[chapterPath(b)])).toBe("x");
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

  it("danh tính bot lấy từ GET /app bằng JWT", async () => {
    const { gh } = await setup();
    expect(await gh.actorLogin()).toBe("the-last-miracle-studio[bot]");
  });
});
