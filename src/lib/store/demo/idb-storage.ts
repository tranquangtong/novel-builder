import { openDB, type IDBPDatabase } from "idb";
import type { MgState, MgStorage } from "./minigit";

/**
 * Lưu kho DEMO trong IndexedDB của trình duyệt (database riêng "nb-demo-repo",
 * tách khỏi nháp). Khóa giữa các tab bằng Web Locks API nếu trình duyệt hỗ trợ.
 */
export class IdbStorage implements MgStorage {
  private dbp: Promise<IDBPDatabase> | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  private db() {
    this.dbp ??= openDB("nb-demo-repo", 1, {
      upgrade(d) {
        d.createObjectStore("objects");
        d.createObjectStore("meta");
      },
    });
    return this.dbp;
  }
  async getState() {
    return ((await (await this.db()).get("meta", "state")) as MgState | undefined) ?? null;
  }
  async putState(s: MgState) {
    await (await this.db()).put("meta", s, "state");
  }
  async getObject(kind: string, sha: string) {
    return (await (await this.db()).get("objects", `${kind}:${sha}`)) as string | undefined;
  }
  async putObject(kind: string, sha: string, data: string) {
    await (await this.db()).put("objects", data, `${kind}:${sha}`);
  }
  withLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks) return locks.request("nb-demo-repo", () => fn()) as Promise<T>;
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
  async clear() {
    const d = await this.db();
    await d.clear("objects");
    await d.clear("meta");
  }
}
