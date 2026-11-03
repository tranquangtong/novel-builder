import type { MgState, MgStorage } from "../src/lib/store/demo/minigit";
import { StoreError } from "../src/lib/store/types";
import type { Env } from "./env";

class StateConflict extends Error {}

/**
 * Lưu kho phiên bản của một bộ truyện trên Cloudflare:
 *  - Đối tượng bất biến (nội dung file, commit) → R2, khóa theo sha: novels/<id>/objects/<kind>/<sha>
 *  - Trạng thái nhỏ (nhánh, đề xuất) → D1, ghi kiểu compare-and-swap theo cột version.
 * withLock: chạy lại thao tác khi có người khác vừa ghi (không cần khóa phân tán).
 */
export class R2D1Storage implements MgStorage {
  private version: number | null = null;

  constructor(private readonly env: Env, private readonly novelId: string) {}

  private key(kind: string, sha: string) {
    return `novels/${this.novelId}/objects/${kind}/${sha}`;
  }

  async getState(): Promise<MgState | null> {
    const r = await this.env.DB.prepare("SELECT state, version FROM repo_state WHERE novel_id = ?").bind(this.novelId).first<{ state: string; version: number }>();
    if (!r) {
      this.version = null;
      return null;
    }
    this.version = r.version;
    return JSON.parse(r.state) as MgState;
  }

  async putState(s: MgState): Promise<void> {
    const json = JSON.stringify(s);
    if (this.version === null) {
      const r = await this.env.DB.prepare("INSERT INTO repo_state (novel_id, state, version) VALUES (?, ?, 1) ON CONFLICT(novel_id) DO NOTHING").bind(this.novelId, json).run();
      if (!r.meta.changes) throw new StateConflict();
      this.version = 1;
      return;
    }
    const r = await this.env.DB.prepare("UPDATE repo_state SET state = ?, version = version + 1 WHERE novel_id = ? AND version = ?").bind(json, this.novelId, this.version).run();
    if (!r.meta.changes) throw new StateConflict();
    this.version += 1;
  }

  async getObject(kind: "blob" | "commit", sha: string) {
    const k = this.key(kind, sha);
    const hit = objectCache.get(k);
    if (hit !== undefined) return hit;
    const o = await this.env.BUCKET.get(k);
    if (!o) return undefined;
    const text = await o.text();
    objectCache.set(k, text);
    return text;
  }

  async putObject(kind: "blob" | "commit", sha: string, data: string) {
    const k = this.key(kind, sha);
    await this.env.BUCKET.put(k, data, { httpMetadata: { contentType: kind === "blob" ? "text/plain; charset=utf-8" : "application/json" } });
    objectCache.set(k, data);
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof StateConflict)) throw e;
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (attempt + 1)));
      }
    }
    throw new StoreError("Có người khác đang ghi cùng lúc, vui lòng thử lại", 503);
  }

  async clear(): Promise<void> {
    throw new StoreError("Không hỗ trợ xóa kho trên Cloudflare", 400);
  }
}

/**
 * Bộ nhớ đệm cho đối tượng bất biến (blob/commit đặt tên theo sha — nội dung không bao giờ đổi),
 * dùng chung giữa các request trong cùng một isolate của Worker. Có giới hạn dung lượng (LRU).
 * Không cache state (D1) vì state thay đổi.
 */
class ObjectCache {
  private map = new Map<string, string>();
  private bytes = 0;
  constructor(private readonly maxBytes: number) {}
  get(k: string) {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: string) {
    if (v.length * 2 > this.maxBytes / 4) return; // bỏ qua đối tượng quá lớn
    const old = this.map.get(k);
    if (old !== undefined) {
      this.bytes -= old.length * 2;
      this.map.delete(k);
    }
    this.map.set(k, v);
    this.bytes += v.length * 2;
    for (const [key, val] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.map.delete(key);
      this.bytes -= val.length * 2;
    }
  }
  clear() {
    this.map.clear();
    this.bytes = 0;
  }
}
export const objectCache = new ObjectCache(24 * 1024 * 1024);
