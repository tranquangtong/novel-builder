import type { MiniGit } from "../../src/lib/store/demo/minigit";

/**
 * GitHub REST API GIẢ, dựng trên mini-git. Mô phỏng các hành vi ghi trong đặc tả OpenAPI
 * chính thức mà ứng dụng dựa vào:
 *  - PATCH git/refs với force=false → 422 khi không fast-forward
 *  - PUT pulls/{n}/merge với sha khác head → 409; không merge được → 405
 *  - CORS: Access-Control-Allow-Origin: *
 * KHÔNG thay thế việc kiểm thử với GitHub thật.
 */
export const FAKE_TOKEN = "github_pat_fake_for_tests";
export const FAKE_LOGIN = "tranquangtong";

export function fakeGitHub(git: MiniGit, opts: { owner?: string; repo?: string; private?: boolean } = {}) {
  const R = `/repos/${opts.owner ?? "o"}/${opts.repo ?? "r"}`;
  const trees = new Map<string, Record<string, string>>();
  const calls: { method: string; path: string; auth: string }[] = [];
  const failures: { method: string; re: RegExp; status: number; message: string }[] = [];
  let mergeHead = "";
  let mergeable: boolean | null = true;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

  async function handle(method: string, url: URL, body: Record<string, unknown> | undefined, auth: string): Promise<Response> {
    const p = decodeURIComponent(url.pathname);
    calls.push({ method, path: p, auth });
    if (auth.toLowerCase() !== `token ${FAKE_TOKEN}`) return json(401, { message: "Bad credentials" });
    const f = failures.findIndex((x) => x.method === method && x.re.test(p));
    if (f >= 0) {
      const [x] = failures.splice(f, 1);
      return json(x.status, { message: x.message });
    }
    let m: RegExpExecArray | null;
    if (method === "GET" && p === "/user") return json(200, { login: FAKE_LOGIN, id: 1 });
    if (method === "GET" && p === R) return json(200, { full_name: R.slice(7), private: opts.private ?? true, default_branch: "main", permissions: { pull: true, push: true } });
    if (method === "GET" && (m = new RegExp(`^${R}/git/ref/heads/(.+)$`).exec(p))) {
      const sha = (await git.readState()).refs[m[1]];
      return sha ? json(200, { ref: `refs/heads/${m[1]}`, object: { sha, type: "commit" } }) : json(404, { message: "Not Found" });
    }
    if (method === "GET" && (m = new RegExp(`^${R}/git/commits/([0-9a-f]{40})$`).exec(p))) {
      const c = await git.readCommit(m[1]);
      trees.set(`tree-${c.sha}`, c.tree);
      return json(200, { sha: c.sha, tree: { sha: `tree-${c.sha}` }, parents: c.parents.map((s) => ({ sha: s })) });
    }
    if (method === "GET" && (m = new RegExp(`^${R}/git/trees/([^/]+)$`).exec(p))) {
      if (!url.searchParams.get("recursive")) return json(400, { message: "fake: cần recursive" });
      const t = trees.get(m[1]);
      if (!t) return json(404, { message: "Not Found" });
      return json(200, { sha: m[1], truncated: false, tree: Object.entries(t).map(([path, sha]) => ({ path, sha, type: "blob", mode: "100644" })) });
    }
    if (method === "GET" && (m = new RegExp(`^${R}/git/blobs/([0-9a-f]{40})$`).exec(p))) {
      return json(200, { sha: m[1], encoding: "base64", content: Buffer.from(await git.readBlob(m[1]), "utf8").toString("base64") });
    }
    if (method === "POST" && p === `${R}/git/trees`) {
      const base = { ...trees.get(String(body!.base_tree))! };
      for (const e of body!.tree as { path: string; sha?: null; content?: string }[]) {
        if (e.sha === null) delete base[e.path];
        else base[e.path] = await git.writeBlob(e.content!);
      }
      const id = `tree-new-${trees.size}`;
      trees.set(id, base);
      return json(201, { sha: id });
    }
    if (method === "POST" && p === `${R}/git/commits`) {
      const c = await git.writeCommit({ tree: trees.get(String(body!.tree))!, parents: body!.parents as string[], message: String(body!.message), author: (body!.author as { name?: string } | undefined)?.name ?? FAKE_LOGIN, date: new Date().toISOString() });
      return json(201, { sha: c.sha });
    }
    if (method === "PATCH" && (m = new RegExp(`^${R}/git/refs/heads/(.+)$`).exec(p))) {
      if (body!.force !== false) return json(400, { message: "fake: ứng dụng phải gửi force=false" });
      const s = await git.readState();
      const c = await git.readCommit(String(body!.sha));
      if (!c.parents.includes(s.refs[m[1]])) return json(422, { message: "Update is not a fast forward" });
      s.refs[m[1]] = String(body!.sha);
      await git.writeState(s);
      return json(200, { object: { sha: body!.sha } });
    }
    if (method === "GET" && p === `${R}/commits`) {
      const head = (await git.readState()).refs[url.searchParams.get("sha") ?? "main"];
      let log = await git.log(head);
      const path = url.searchParams.get("path");
      if (path) {
        const keep = [];
        for (const c of log) if (c.parents.length === 0 ? c.tree[path] !== undefined : (await git.readCommit(c.parents[0])).tree[path] !== c.tree[path]) keep.push(c);
        log = keep;
      }
      const per = Number(url.searchParams.get("per_page") ?? 30), page = Number(url.searchParams.get("page") ?? 1);
      return json(200, log.slice((page - 1) * per, page * per).map((c) => ({ sha: c.sha, parents: c.parents.map((s) => ({ sha: s })), commit: { message: c.message, author: { name: c.author, date: c.date } }, author: { login: c.author } })));
    }
    if (method === "GET" && (m = new RegExp(`^${R}/commits/([0-9a-f]{40})$`).exec(p))) {
      const c = await git.readCommit(m[1]);
      const files = await git.changedFiles(c.parents[0] ?? null, c.sha);
      return json(200, { sha: c.sha, parents: c.parents.map((s) => ({ sha: s })), commit: { message: c.message, author: { name: c.author, date: c.date } }, author: { login: c.author }, files: files.map((f) => ({ filename: f.path, status: f.status })) });
    }
    if (method === "GET" && p === `${R}/pulls`) return json(200, []);
    if (method === "PUT" && (m = new RegExp(`^${R}/pulls/(\\d+)/merge$`).exec(p))) {
      if (body!.sha !== mergeHead) return json(409, { message: "Head branch was modified. Review and try the merge again." });
      if (!mergeable) return json(405, { message: "Pull Request is not mergeable" });
      return json(200, { sha: "f".repeat(40), merged: true });
    }
    return json(404, { message: `fake: ${method} ${p} chưa hỗ trợ` });
  }

  return {
    calls,
    /** Lần gọi khớp kế tiếp sẽ trả lỗi (để thử “lưu thất bại”). */
    failNext(method: string, re: RegExp, status = 502, message = "Server Error") {
      failures.push({ method, re, status, message });
    },
    setMerge(head: string, ok: boolean | null) {
      mergeHead = head;
      mergeable = ok;
    },
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      return handle(method, url, body, auth);
    },
    handle,
  };
}
