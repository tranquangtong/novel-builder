import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Env } from "../../worker/env";

/**
 * Môi trường Cloudflare GIẢ cho unit test của Worker:
 *  - D1 → SQLite thật trong bộ nhớ (node:sqlite), chạy đúng file migrations/*.sql
 *  - R2 → Map trong bộ nhớ với put/get/list/delete/head
 * Phần chạy trên runtime thật (workerd) được kiểm bằng E2E với `wrangler dev`.
 */
class FakeStmt {
  private args: unknown[] = [];
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...a: unknown[]) {
    const s = new FakeStmt(this.db, this.sql);
    s.args = a;
    return s;
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...(this.args as never[])) as T) ?? null;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...(this.args as never[])) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as never[]));
    return { success: true, meta: { changes: Number(r.changes) }, results: [] };
  }
  runSync() {
    const r = this.db.prepare(this.sql).run(...(this.args as never[]));
    return { success: true, meta: { changes: Number(r.changes) }, results: [] };
  }
}

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of fs.readdirSync("migrations").sort()) db.exec(fs.readFileSync(path.join("migrations", f), "utf8"));
  return {
    prepare: (sql: string) => new FakeStmt(db, sql),
    async batch(stmts: FakeStmt[]) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s.runSync());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    raw: db,
  };
}

type Obj = { data: Uint8Array; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string>; uploaded: Date };

export function fakeR2() {
  const m = new Map<string, Obj>();
  const toBytes = async (v: unknown): Promise<Uint8Array> => {
    if (typeof v === "string") return new TextEncoder().encode(v);
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    throw new Error("fake R2: kiểu dữ liệu chưa hỗ trợ");
  };
  const view = (key: string, o: Obj) => ({
    key, size: o.data.byteLength, uploaded: o.uploaded, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata, httpEtag: `"${key.length}-${o.data.byteLength}"`,
    writeHttpMetadata(h: Headers) {
      if (o.httpMetadata?.contentType) h.set("content-type", o.httpMetadata.contentType);
    },
    body: new Blob([o.data]).stream(),
    text: async () => new TextDecoder().decode(o.data),
    json: async () => JSON.parse(new TextDecoder().decode(o.data)) as unknown,
    arrayBuffer: async () => o.data.slice().buffer,
  });
  return {
    objects: m,
    async put(key: string, value: unknown, opts?: { httpMetadata?: Obj["httpMetadata"]; customMetadata?: Obj["customMetadata"] }) {
      m.set(key, { data: await toBytes(value), httpMetadata: opts?.httpMetadata, customMetadata: opts?.customMetadata, uploaded: new Date() });
      return {};
    },
    async get(key: string) {
      const o = m.get(key);
      return o ? view(key, o) : null;
    },
    async head(key: string) {
      const o = m.get(key);
      return o ? view(key, o) : null;
    },
    async delete(key: string) {
      m.delete(key);
    },
    async list(opts: { prefix?: string } = {}) {
      const objects = [...m.entries()].filter(([k]) => k.startsWith(opts.prefix ?? "")).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, o]) => view(k, o));
      return { objects, truncated: false, delimitedPrefixes: [] };
    },
  };
}

export function fakeEnv(over: Partial<Env> = {}) {
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    BUCKET: fakeR2(),
    DB: fakeD1(),
    ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
    ACCESS_AUD: "aud-test",
    EDITOR_EMAILS: "tac-gia@example.com",
    AGENT_CLIENT_IDS: "agentclient.access",
    ...over,
  };
  return env as unknown as Env & { BUCKET: ReturnType<typeof fakeR2>; DB: ReturnType<typeof fakeD1> };
}
