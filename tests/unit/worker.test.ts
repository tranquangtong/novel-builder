import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import worker from "../../worker/index";
import { FIREBASE_JWKS_URL, registerJwksForTests } from "../../worker/auth";
import { fakeEnv } from "../support/fake-cloudflare";

const TEAM = "https://team.cloudflareaccess.com";
let priv: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair("RS256");
  priv = kp.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256" };
  registerJwksForTests(TEAM, createLocalJWKSet({ keys: [jwk] }));
  registerJwksForTests(FIREBASE_JWKS_URL, createLocalJWKSet({ keys: [jwk] }));
});

async function token(claims: Record<string, unknown>, opts: { aud?: string; iss?: string } = {}) {
  return new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(opts.iss ?? TEAM).setAudience(opts.aud ?? "aud-test").setIssuedAt().setExpirationTime("5m").sign(priv);
}

function call(env: ReturnType<typeof fakeEnv>, method: string, path: string, opts: { jwt?: string; bearer?: string; cookie?: string; body?: unknown; raw?: BodyInit; type?: string; origin?: string } = {}) {
  const headers = new Headers();
  if (opts.jwt) headers.set("cf-access-jwt-assertion", opts.jwt);
  if (opts.bearer) headers.set("authorization", `Bearer ${opts.bearer}`);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.type) headers.set("content-type", opts.type);
  if (method !== "GET") headers.set("origin", opts.origin ?? "https://novel.example.com");
  return worker.fetch(new Request(`https://novel.example.com${path}`, { method, headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) }), env);
}

describe("Worker: xác thực Cloudflare Access", () => {
  it("không có JWT → 401, JWT sai audience/issuer → 401, thiếu cấu hình → 500", async () => {
    const env = fakeEnv();
    expect((await call(env, "GET", "/api/novels")).status).toBe(401);
    expect((await call(env, "GET", "/api/novels", { jwt: await token({ email: "tac-gia@example.com" }, { aud: "khac" }) })).status).toBe(401);
    expect((await call(env, "GET", "/api/novels", { jwt: await token({ email: "tac-gia@example.com" }, { iss: "https://evil.cloudflareaccess.com" }) })).status).toBe(401);
    const noCfg = fakeEnv({ ACCESS_AUD: undefined });
    expect((await call(noCfg, "GET", "/api/novels", { jwt: await token({ email: "tac-gia@example.com" }) })).status).toBe(500);
  });

  it("team domain có hoặc không có https:// đều được; sai AUD thì báo rõ lý do", async () => {
    const bare = fakeEnv({ ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com/" });
    const ok = await call(bare, "GET", "/api/me", { jwt: await token({ email: "tac-gia@example.com" }) });
    expect(await ok.json()).toMatchObject({ role: "editor" });
    const env = fakeEnv();
    const bad = await call(env, "GET", "/api/me", { jwt: await token({ email: "tac-gia@example.com" }, { aud: "44b8d105bdf56bff" }) });
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { error: string }).error).toMatch(/AUD của ứng dụng Access là 44b8d105bd…, nhưng ACCESS_AUD là aud-test…/);
    const two = fakeEnv({ ACCESS_AUD: "khac, aud-test" });
    expect((await call(two, "GET", "/api/me", { jwt: await token({ email: "tac-gia@example.com" }) })).status).toBe(200);
  });

  it("bỏ qua Access chỉ khi DEV_AUTH_EMAIL được đặt VÀ host là localhost", async () => {
    const env = fakeEnv({ DEV_AUTH_EMAIL: "tac-gia@example.com" });
    const r = await worker.fetch(new Request("https://novel.example.com/api/me"), env);
    expect(r.status).toBe(401);
    const local = await worker.fetch(new Request("http://localhost:8787/api/me"), env);
    expect(await local.json()).toMatchObject({ role: "editor", name: "tac-gia@example.com" });
  });

  it("trang tĩnh không đi qua kiểm tra (Access chặn ở rìa mạng), API thì có", async () => {
    const env = fakeEnv();
    expect(await (await worker.fetch(new Request("https://novel.example.com/library/"), env)).text()).toBe("asset");
  });
});

describe("Worker: bộ truyện, phân quyền, ghi đồng thời", () => {
  it("biên tập tạo và sửa; người chỉ đọc chỉ xem; agent chỉ đề xuất", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    const reader = await token({ email: "ban-doc@example.com" });
    const agent = await token({ common_name: "agentclient.access", sub: "" });
    const stranger = await token({ common_name: "khac.access", sub: "" });

    const created = await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "The Last Miracle" } });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await call(env, "POST", "/api/novels", { jwt: reader, body: { title: "x" } })).status).toBe(403);
    // người đọc không vào được API biên tập (kể cả chỉ đọc)
    expect((await call(env, "GET", `/api/novels/${id}/project`, { jwt: reader })).status).toBe(403);

    const snap = (await (await call(env, "GET", `/api/novels/${id}/project`, { jwt: editor })).json()) as { acts: { id: string }[]; repo: string };
    expect(snap.repo).toBe(`cloud:${id}`);
    const ch = (await (await call(env, "POST", `/api/novels/${id}/chapters`, { jwt: editor, body: { title: "Chương 1", act_id: snap.acts[0].id } })).json()) as { id: string };
    const v = (await (await call(env, "GET", `/api/novels/${id}/chapters/${ch.id}`, { jwt: editor })).json()) as { blob: string; doc: { meta: Record<string, unknown> } };
    const meta = { ...v.doc.meta };
    delete meta.id;

    // người chỉ đọc không được lưu
    expect((await call(env, "PUT", `/api/novels/${id}/chapters/${ch.id}`, { jwt: reader, body: { meta, body: "x", baseBlob: v.blob } })).status).toBe(403);
    // agent không được lưu thẳng bản chính
    expect((await call(env, "PUT", `/api/novels/${id}/chapters/${ch.id}`, { jwt: agent, body: { meta, body: "x", baseBlob: v.blob } })).status).toBe(403);
    // service token lạ bị từ chối hẳn
    expect((await call(env, "GET", `/api/novels/${id}/project`, { jwt: stranger })).status).toBe(403);

    // agent mở đề xuất
    const prop = await call(env, "POST", `/api/novels/${id}/agent/proposals`, { jwt: agent, body: { title: "Agent: sửa Ch 1", body: "lý do", changes: { [`content/chapters/${ch.id}.md`]: `---\nid: ${ch.id}\ntitle: Chương 1\nact_id: ${snap.acts[0].id}\norder: 1\nstatus: draft\n---\nAgent viết.\n` } } });
    expect(prop.status).toBe(200);
    const { number } = (await prop.json()) as { number: number };
    // agent không được nhập đề xuất
    const pr = (await (await call(env, "GET", `/api/novels/${id}/proposals/${number}`, { jwt: agent })).json()) as { pr: { headSha: string; author: string } };
    expect(pr.pr.author).toMatch(/^agent:/);
    expect((await call(env, "POST", `/api/novels/${id}/proposals/${number}/merge`, { jwt: agent, body: { expectedHeadSha: pr.pr.headSha } })).status).toBe(403);
    // agent không được sửa chỉ mục tự sinh
    expect((await call(env, "POST", `/api/novels/${id}/agent/proposals`, { jwt: agent, body: { title: "x", changes: { "content/index.json": "{}" } } })).status).toBe(400);
    // biên tập nhập đề xuất
    expect((await call(env, "POST", `/api/novels/${id}/proposals/${number}/merge`, { jwt: editor, body: { expectedHeadSha: pr.pr.headSha } })).status).toBe(200);
    const after = (await (await call(env, "GET", `/api/novels/${id}/chapters/${ch.id}`, { jwt: editor })).json()) as { doc: { body: string } };
    expect(after.doc.body).toBe("Agent viết.\n");
  });

  it("hai lần lưu cùng lúc vào hai chương khác nhau đều thành công; cùng chương thì một bên bị 409", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    const { id } = (await (await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "B" } })).json()) as { id: string };
    const snap = (await (await call(env, "GET", `/api/novels/${id}/project`, { jwt: editor })).json()) as { acts: { id: string }[] };
    const mk = async (t: string) => ((await (await call(env, "POST", `/api/novels/${id}/chapters`, { jwt: editor, body: { title: t, act_id: snap.acts[0].id } })).json()) as { id: string }).id;
    const a = await mk("A"), b = await mk("B");
    const load = async (c: string) => (await (await call(env, "GET", `/api/novels/${id}/chapters/${c}`, { jwt: editor })).json()) as { blob: string; doc: { meta: Record<string, unknown> } };
    const save = async (c: string, text: string) => {
      const v = await load(c);
      const meta = { ...v.doc.meta };
      delete meta.id;
      return call(env, "PUT", `/api/novels/${id}/chapters/${c}`, { jwt: editor, body: { meta, body: text, baseBlob: v.blob } });
    };
    const [ra, rb] = await Promise.all([save(a, "nội dung A\n"), save(b, "nội dung B\n")]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect((await load(a)).doc).toMatchObject({ body: "nội dung A\n" });
    expect((await load(b)).doc).toMatchObject({ body: "nội dung B\n" });
    const va = await load(a);
    const meta = { ...va.doc.meta };
    delete meta.id;
    const [x, y] = await Promise.all([
      call(env, "PUT", `/api/novels/${id}/chapters/${a}`, { jwt: editor, body: { meta, body: "bản 1\n", baseBlob: va.blob } }),
      call(env, "PUT", `/api/novels/${id}/chapters/${a}`, { jwt: editor, body: { meta, body: "bản 2\n", baseBlob: va.blob } }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it("chuyển bộ truyện có sẵn (ví dụ từ GitHub): giữ nguyên văn, sinh lại chỉ mục, chặn đường dẫn lạ", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    const chapter = "---\nid: ch_abc123\ntitle: TÀN TRO\nact_id: act_x1\norder: 1\nstatus: draft\n---\nDòng đầu  có  hai khoảng trắng — giữ nguyên!\n";
    const files = { "content/project.json": '{"title":"The Last Miracle","word_target":{"min":2500,"max":3000}}\n', "content/acts/act_x1.md": "---\nid: act_x1\ntitle: Act 1\norder: 1\n---\n", "content/chapters/ch_abc123.md": chapter };
    const r = await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "TLM", files } });
    expect(r.status).toBe(201);
    const { id, chapters } = (await r.json()) as { id: string; chapters: number };
    expect(chapters).toBe(1);
    const raw = (await (await call(env, "GET", `/api/novels/${id}/file?path=content/chapters/ch_abc123.md`, { jwt: editor })).json()) as { content: string };
    expect(raw.content).toBe(chapter);
    const snap = (await (await call(env, "GET", `/api/novels/${id}/project`, { jwt: editor })).json()) as { indexStale: number; chapters: { words: number }[] };
    expect(snap.indexStale).toBe(0);
    expect((await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "x", files: { ...files, "../../secret": "x" } } })).status).toBe(400);
    expect((await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "x", files: { "content/acts/a.md": "x" } } })).status).toBe(400);
  });
});

describe("Worker: ảnh của chương", () => {
  it("tải lên, liệt kê, tải về, chặn SVG/quá cỡ/người chỉ đọc, xoá vào thùng rác", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    const reader = await token({ email: "ban-doc@example.com" });
    const { id } = (await (await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "B" } })).json()) as { id: string };
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const up = await call(env, "POST", `/api/novels/${id}/assets?chapter=ch_abc123&kind=sketch&caption=${encodeURIComponent("Phác thảo Zen")}&name=${encodeURIComponent("Zen ở Đáy Sắt.png")}`, { jwt: editor, raw: png, type: "image/png" });
    expect(up.status).toBe(201);
    const a = (await up.json()) as { key: string; caption: string };
    expect(a.key).toMatch(/^ch_abc123\/[0-9a-z]+-[0-9a-z]+-Zen-o-Day-Sat\.png$/);
    expect(a.caption).toBe("Phác thảo Zen");
    const list = (await (await call(env, "GET", `/api/novels/${id}/assets?chapter=ch_abc123`, { jwt: editor })).json()) as { assets: { key: string; caption: string; kind: string }[] };
    expect(list.assets).toHaveLength(1);
    expect(list.assets[0]).toMatchObject({ caption: "Phác thảo Zen", kind: "sketch" });
    const file = await call(env, "GET", `/api/novels/${id}/assets/file/${a.key}`, { jwt: reader });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
    expect((await call(env, "POST", `/api/novels/${id}/assets?chapter=ch_abc123`, { jwt: editor, raw: "<svg/>", type: "image/svg+xml" })).status).toBe(415);
    expect((await call(env, "POST", `/api/novels/${id}/assets?chapter=ch_abc123`, { jwt: editor, raw: new Uint8Array(15 * 1024 * 1024 + 1), type: "image/png" })).status).toBe(413);
    expect((await call(env, "POST", `/api/novels/${id}/assets?chapter=ch_abc123`, { jwt: reader, raw: png, type: "image/png" })).status).toBe(403);
    expect((await call(env, "GET", `/api/novels/${id}/assets/file/..%2F..%2Fobjects%2Fx`, { jwt: reader })).status).toBe(404);
    expect((await call(env, "DELETE", `/api/novels/${id}/assets/file/${a.key}`, { jwt: editor })).status).toBe(200);
    expect(((await (await call(env, "GET", `/api/novels/${id}/assets?chapter=ch_abc123`, { jwt: editor })).json()) as { assets: unknown[] }).assets).toHaveLength(0);
    expect([...env.BUCKET.objects.keys()].some((k) => k.startsWith(`novels/${id}/trash/ch_abc123/`))).toBe(true);
  });

  it("chặn request ghi từ trang khác (CSRF)", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    expect((await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "x" }, origin: "https://evil.example" })).status).toBe(403);
  });
});

describe("R2D1Storage: compare-and-swap", () => {
  it("hai phiên cùng đọc rồi cùng ghi → phiên thứ hai bị từ chối, withLock chạy lại trên bản mới", async () => {
    const { R2D1Storage } = await import("../../worker/storage");
    const env = fakeEnv();
    env.DB.raw.exec("INSERT INTO novels (id, title, created_at, created_by) VALUES ('nv_test01', 't', 'x', 'x')");
    const a = new R2D1Storage(env, "nv_test01");
    const b = new R2D1Storage(env, "nv_test01");
    await a.putState({ refs: { main: "1" }, pulls: [] }); // tạo
    const sa = (await a.getState())!;
    const sb = (await b.getState())!;
    sa.refs.main = "2";
    await a.putState(sa);
    sb.refs.main = "3";
    await expect(b.putState(sb)).rejects.toThrow(); // b dựa trên bản cũ → bị chặn
    expect((await a.getState())!.refs.main).toBe("2");
    // withLock: đọc lại và áp dụng trên bản mới nhất
    let attempts = 0;
    await b.withLock(async () => {
      attempts++;
      const s = (await b.getState())!;
      if (attempts === 1) {
        const c = (await a.getState())!; // có người chen vào giữa
        c.refs.other = "x";
        await a.putState(c);
      }
      s.refs.main = `${s.refs.main}+b`;
      await b.putState(s);
    });
    expect(attempts).toBe(2);
    const final = (await a.getState())!;
    expect(final.refs).toEqual({ main: "2+b", other: "x" });
  });
});

describe("Worker: nháp tự lưu trên R2, đổi tên, thống kê", () => {
  it("nháp lưu/đọc/xoá trên R2, không bị thiết bị khác ghi đè bằng bản cũ hơn, người chỉ đọc không ghi được", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    const reader = await token({ email: "ban-doc@example.com" });
    const { id } = (await (await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "B" } })).json()) as { id: string };
    const url = `/api/novels/${id}/drafts/ch_abc123`;
    expect(await (await call(env, "GET", url, { jwt: editor })).json()).toEqual({ draft: null });
    const d1 = { baseBlob: "b1", baseCommit: "c1", body: "Đêm ấy — “Ừ.”", meta: { title: "T" }, updatedAt: 2000, device: "may-A" };
    expect((await call(env, "PUT", url, { jwt: editor, body: d1 })).status).toBe(200);
    expect([...env.BUCKET.objects.keys()]).toContain(`novels/${id}/drafts/ch_abc123.json`);
    const got = (await (await call(env, "GET", url, { jwt: editor })).json()) as { draft: { body: string; by: string } };
    expect(got.draft).toMatchObject({ body: "Đêm ấy — “Ừ.”", by: "tac-gia@example.com" });
    // thiết bị khác gửi bản cũ hơn → 409 kèm nháp mới nhất, không ghi đè
    const stale = await call(env, "PUT", url, { jwt: editor, body: { ...d1, body: "cũ", updatedAt: 1000, device: "may-B" } });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { draft: { body: string } }).draft.body).toBe("Đêm ấy — “Ừ.”");
    // cùng thiết bị thì được
    expect((await call(env, "PUT", url, { jwt: editor, body: { ...d1, body: "mới", updatedAt: 3000 } })).status).toBe(200);
    expect((await call(env, "PUT", url, { jwt: reader, body: d1 })).status).toBe(403);
    // danh sách nháp
    expect(((await (await call(env, "GET", `/api/novels/${id}/drafts`, { jwt: editor })).json()) as { drafts: { chapterId: string }[] }).drafts.map((x) => x.chapterId)).toEqual(["ch_abc123"]);
    // xoá có điều kiện: nháp mới hơn mốc lưu thì giữ lại
    expect(await (await call(env, "DELETE", `${url}?ifUpdatedAt=2500`, { jwt: editor })).json()).toEqual({ deleted: false });
    expect(await (await call(env, "DELETE", `${url}?ifUpdatedAt=3000`, { jwt: editor })).json()).toEqual({ deleted: true });
    expect(await (await call(env, "GET", url, { jwt: editor })).json()).toEqual({ draft: null });
    expect((await call(env, "GET", `/api/novels/${id}/drafts/..%2Fobjects`, { jwt: editor })).status).toBe(400);
  });

  it("đổi tên cập nhật cả danh sách và project.json (một phiên bản mới); thống kê chương/chữ", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    const reader = await token({ email: "ban-doc@example.com" });
    const files = {
      "content/project.json": '{"title":"Tên cũ"}\n',
      "content/acts/act_x1.md": "---\nid: act_x1\ntitle: Act 1\norder: 1\n---\n",
      "content/chapters/ch_abc123.md": "---\nid: ch_abc123\ntitle: Một\nact_id: act_x1\norder: 1\nstatus: draft\n---\nmột hai ba ![ảnh](asset:x.png)\n",
    };
    const { id } = (await (await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "Tên cũ", files } })).json()) as { id: string };
    expect((await call(env, "PATCH", `/api/novels/${id}`, { jwt: reader, body: { title: "x" } })).status).toBe(403);
    expect((await call(env, "PATCH", `/api/novels/${id}`, { jwt: editor, body: { title: "  " } })).status).toBe(400);
    expect((await call(env, "PATCH", `/api/novels/${id}`, { jwt: editor, body: { title: "The Last Miracle" } })).status).toBe(200);
    const list = (await (await call(env, "GET", "/api/novels?stats=1", { jwt: editor })).json()) as { novels: { id: string; title: string; stats: { chapters: number; words: number; acts: number } }[] };
    expect(list.novels[0]).toMatchObject({ id, title: "The Last Miracle", stats: { chapters: 1, words: 3, acts: 1 } });
    const pj = (await (await call(env, "GET", `/api/novels/${id}/file?path=content/project.json`, { jwt: editor })).json()) as { content: string };
    expect(JSON.parse(pj.content).title).toBe("The Last Miracle");
    const snap = (await (await call(env, "GET", `/api/novels/${id}/project`, { jwt: editor })).json()) as { project: { title: string } };
    expect(snap.project.title).toBe("The Last Miracle");
  });

  it("ảnh: nhận các loại nhân vật / cảnh quan / cảnh hành động; từ chối loại lạ", async () => {
    const env = fakeEnv();
    const editor = await token({ email: "tac-gia@example.com" });
    const { id } = (await (await call(env, "POST", "/api/novels", { jwt: editor, body: { title: "B" } })).json()) as { id: string };
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    for (const kind of ["character", "scenery", "action", "other"]) {
      expect((await call(env, "POST", `/api/novels/${id}/assets?chapter=ch_abc123&kind=${kind}&name=a.png`, { jwt: editor, raw: png, type: "image/png" })).status).toBe(201);
    }
    expect((await call(env, "POST", `/api/novels/${id}/assets?chapter=ch_abc123&kind=la-lung&name=a.png`, { jwt: editor, raw: png, type: "image/png" })).status).toBe(400);
    const list = (await (await call(env, "GET", `/api/novels/${id}/assets?chapter=ch_abc123`, { jwt: editor })).json()) as { assets: { kind: string }[] };
    expect(list.assets.map((a) => a.kind).sort()).toEqual(["action", "character", "other", "scenery"]);
  });
});

// ---------------- Đăng nhập Google qua Firebase ----------------
const PROJECT = "tlm-test";
async function fbToken(email: string, over: Record<string, unknown> = {}, opts: { aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT({ email, email_verified: true, firebase: { sign_in_provider: "google.com" }, auth_time: Math.floor(Date.now() / 1000) - 10, ...over })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.aud ?? PROJECT)
    .setSubject("uid-123")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(priv);
}
const fbEnv = () => fakeEnv({ FIREBASE_PROJECT_ID: PROJECT, ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined, AGENT_TOKENS: "claude:nbagent_0123456789abcdef0123456789abcdef" });

describe("Worker: đăng nhập Google (Firebase), người đọc, agent token", () => {
  it("token Google hợp lệ: email trong EDITOR_EMAILS là biên tập, còn lại là người đọc", async () => {
    const env = fbEnv();
    expect(await (await call(env, "GET", "/api/me", { bearer: await fbToken("tac-gia@example.com") })).json()).toMatchObject({ role: "editor" });
    expect(await (await call(env, "GET", "/api/me", { bearer: await fbToken("ban-doc@gmail.com") })).json()).toMatchObject({ role: "viewer", name: "ban-doc@gmail.com" });
  });

  it("từ chối: sai project (aud/iss), hết hạn, không phải Google, email chưa xác minh, không có token", async () => {
    const env = fbEnv();
    expect((await call(env, "GET", "/api/me")).status).toBe(401);
    expect((await call(env, "GET", "/api/me", { bearer: await fbToken("a@gmail.com", {}, { aud: "khac" }) })).status).toBe(401);
    expect((await call(env, "GET", "/api/me", { bearer: await fbToken("a@gmail.com", {}, { iss: "https://securetoken.google.com/khac" }) })).status).toBe(401);
    const expired = await call(env, "GET", "/api/me", { bearer: await fbToken("a@gmail.com", {}, { exp: "-1m" }) });
    expect(expired.status).toBe(401);
    expect(((await expired.json()) as { error: string }).error).toContain("hết hạn");
    expect((await call(env, "GET", "/api/me", { bearer: await fbToken("a@gmail.com", { firebase: { sign_in_provider: "password" } }) })).status).toBe(403);
    expect((await call(env, "GET", "/api/me", { bearer: await fbToken("a@gmail.com", { email_verified: false }) })).status).toBe(403);
    // token ký bằng khoá khác
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "tac-gia@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(PROJECT).setSubject("x").setIssuedAt().setExpirationTime("1h").sign(other.privateKey);
    expect((await call(env, "GET", "/api/me", { bearer: forged })).status).toBe(401);
  });

  it("/api/session đặt cookie HttpOnly + SameSite=Strict; cookie dùng được cho API; DELETE xoá cookie", async () => {
    const env = fbEnv();
    const t = await fbToken("ban-doc@gmail.com");
    const r = await call(env, "POST", "/api/session", { body: { idToken: t } });
    expect(r.status).toBe(200);
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/^nb_session=/);
    expect(sc).toContain("HttpOnly");
    expect(sc).toContain("SameSite=Strict");
    expect(sc).toContain("Secure");
    expect(sc).toMatch(/Max-Age=(3[0-5]\d\d|3600)/);
    const cookie = sc.split(";")[0];
    expect(await (await call(env, "GET", "/api/me", { cookie })).json()).toMatchObject({ role: "viewer" });
    expect((await call(env, "POST", "/api/session", { body: { idToken: "rác" } })).status).toBe(401);
    expect((await call(env, "POST", "/api/session", { body: { idToken: t }, origin: "https://evil.example" })).status).toBe(403);
    expect((await call(env, "DELETE", "/api/session")).headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("người đọc: chỉ thấy chương truyện (không Act 0), không vào được API biên tập", async () => {
    const env = fbEnv();
    const editor = await fbToken("tac-gia@example.com");
    const reader = await fbToken("ban-doc@gmail.com");
    const files = {
      "content/project.json": '{"title":"The Last Miracle"}\n',
      "content/acts/act_n0.md": "---\nid: act_n0\ntitle: Act 0 · Outline & Trivia\norder: 0\nkind: notes\n---\n",
      "content/acts/act_a1.md": "---\nid: act_a1\ntitle: Act 1\norder: 1\n---\n",
      "content/chapters/ch_note00001.md": "---\nid: ch_note00001\ntitle: Outline bí mật\nact_id: act_n0\norder: 1\nstatus: draft\n---\nKết truyện: Zen chết.\n",
      "content/chapters/ch_story0001.md": "---\nid: ch_story0001\ntitle: Tàn tro\nact_id: act_a1\norder: 1\nstatus: draft\n---\nĐêm ấy.\n",
      "content/chapters/ch_story0002.md": "---\nid: ch_story0002\ntitle: Dấu thập đỏ\nact_id: act_a1\norder: 2\nstatus: draft\n---\nSáng hôm sau.\n",
    };
    const { id } = (await (await call(env, "POST", "/api/novels", { bearer: editor, body: { title: "TLM", files } })).json()) as { id: string };
    expect((await call(env, "POST", "/api/novels", { bearer: reader, body: { title: "x" } })).status).toBe(403);

    const list = (await (await call(env, "GET", "/api/novels?stats=1", { bearer: reader })).json()) as { novels: Record<string, unknown>[] };
    expect(list.novels).toEqual([{ id, title: "TLM" }]);

    const toc = (await (await call(env, "GET", `/api/novels/${id}/read`, { bearer: reader })).json()) as { acts: { title: string; chapters: { id: string; number: number }[] }[] };
    expect(toc.acts.map((a) => a.title)).toEqual(["Act 1"]);
    expect(toc.acts[0].chapters.map((c) => [c.id, c.number])).toEqual([["ch_story0001", 1], ["ch_story0002", 2]]);
    expect(JSON.stringify(toc)).not.toContain("bí mật");

    const ch = (await (await call(env, "GET", `/api/novels/${id}/read/ch_story0001`, { bearer: reader })).json()) as Record<string, unknown>;
    expect(ch).toMatchObject({ title: "Tàn tro", number: 1, body: "Đêm ấy.\n", prev: null, next: { id: "ch_story0002", number: 2 } });
    expect(ch).not.toHaveProperty("blob");
    expect((await call(env, "GET", `/api/novels/${id}/read/ch_note00001`, { bearer: reader })).status).toBe(404);

    for (const [m, p] of [["GET", "/project"], ["GET", "/chapters/ch_story0001"], ["GET", "/proposals"], ["GET", "/history"], ["GET", "/export"], ["GET", "/file?path=content/chapters/ch_note00001.md"], ["GET", "/drafts"], ["GET", "/assets?chapter=ch_story0001"]] as const) {
      expect([m, p, (await call(env, m, `/api/novels/${id}${p}`, { bearer: reader })).status]).toEqual([m, p, 403]);
    }
    // ảnh chèn trong chương vẫn tải được
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const a = (await (await call(env, "POST", `/api/novels/${id}/assets?chapter=ch_story0001&name=a.png`, { bearer: editor, raw: png, type: "image/png" })).json()) as { key: string };
    expect((await call(env, "GET", `/api/novels/${id}/assets/file/${a.key}`, { bearer: reader })).status).toBe(200);
    // biên tập cũng dùng được chế độ đọc
    expect((await call(env, "GET", `/api/novels/${id}/read`, { bearer: editor })).status).toBe(200);
  });

  it("agent dùng token riêng (không cần Cloudflare Access); token sai bị từ chối", async () => {
    const env = fbEnv();
    expect(await (await call(env, "GET", "/api/me", { bearer: "nbagent_0123456789abcdef0123456789abcdef" })).json()).toMatchObject({ role: "agent", name: "agent:claude" });
    expect((await call(env, "GET", "/api/me", { bearer: "nbagent_0123456789abcdef0123456789abcdeX" })).status).toBe(401);
    expect((await call(fakeEnv({ FIREBASE_PROJECT_ID: PROJECT }), "GET", "/api/me", { bearer: "nbagent_0123456789abcdef0123456789abcdef" })).status).toBe(401);
  });
});
