import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import worker from "../../worker/index";
import { registerJwksForTests } from "../../worker/auth";
import { fakeEnv } from "../support/fake-cloudflare";

const TEAM = "https://team.cloudflareaccess.com";
let priv: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair("RS256");
  priv = kp.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256" };
  registerJwksForTests(TEAM, createLocalJWKSet({ keys: [jwk] }));
});

async function token(claims: Record<string, unknown>, opts: { aud?: string; iss?: string } = {}) {
  return new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(opts.iss ?? TEAM).setAudience(opts.aud ?? "aud-test").setIssuedAt().setExpirationTime("5m").sign(priv);
}

function call(env: ReturnType<typeof fakeEnv>, method: string, path: string, opts: { jwt?: string; body?: unknown; raw?: BodyInit; type?: string; origin?: string } = {}) {
  const headers = new Headers();
  if (opts.jwt) headers.set("cf-access-jwt-assertion", opts.jwt);
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

    const snap = (await (await call(env, "GET", `/api/novels/${id}/project`, { jwt: reader })).json()) as { acts: { id: string }[]; repo: string };
    expect(snap.repo).toBe(`cloud:${id}`);
    const ch = (await (await call(env, "POST", `/api/novels/${id}/chapters`, { jwt: editor, body: { title: "Chương 1", act_id: snap.acts[0].id } })).json()) as { id: string };
    const v = (await (await call(env, "GET", `/api/novels/${id}/chapters/${ch.id}`, { jwt: reader })).json()) as { blob: string; doc: { meta: Record<string, unknown> } };
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
    const after = (await (await call(env, "GET", `/api/novels/${id}/chapters/${ch.id}`, { jwt: reader })).json()) as { doc: { body: string } };
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
    const list = (await (await call(env, "GET", `/api/novels/${id}/assets?chapter=ch_abc123`, { jwt: reader })).json()) as { assets: { key: string; caption: string; kind: string }[] };
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
