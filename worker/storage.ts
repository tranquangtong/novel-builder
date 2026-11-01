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
    const o = await this.env.BUCKET.get(this.key(kind, sha));
    return o ? await o.text() : undefined;
  }

  async putObject(kind: "blob" | "commit", sha: string, data: string) {
    await this.env.BUCKET.put(this.key(kind, sha), data, { httpMetadata: { contentType: kind === "blob" ? "text/plain; charset=utf-8" : "application/json" } });
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
