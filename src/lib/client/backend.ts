"use client";
import { ManuscriptService } from "../core/service";
import { DemoStore } from "../store/demo/demo-store";
import { IdbStorage } from "../store/demo/idb-storage";
import { MiniGit } from "../store/demo/minigit";
import { seedDemo } from "../store/demo/seed";
import { GitHubStore } from "../store/github/github-store";
import { connectionKey, loadConnection, type Connection } from "./connection";

let cached: { key: string; svc: ManuscriptService; git?: MiniGit; conn: Connection } | null = null;
let seeding: Promise<void> | null = null;

export class NotConnectedError extends Error {}

async function ensureSeeded(git: MiniGit) {
  if (await git.isInitialized()) return;
  // Không bọc trong withLock: seedDemo tự ghi qua commitFiles (đã có khóa), khóa lồng nhau sẽ treo.
  seeding ??= seedDemo(git)
    .then(() => undefined)
    .finally(() => (seeding = null));
  await seeding;
}

export async function getBackend() {
  const conn = loadConnection();
  if (!conn) throw new NotConnectedError("Chưa kết nối");
  const key = connectionKey(conn);
  if (cached?.key === key) {
    if (cached.git) await ensureSeeded(cached.git);
    return cached;
  }
  if (conn.mode === "demo") {
    const git = new MiniGit(new IdbStorage());
    await ensureSeeded(git);
    cached = { key, svc: new ManuscriptService(new DemoStore(git)), git, conn };
    // Cửa cho test tự động — CHỈ ở chế độ demo (không có token, không có bản thảo thật).
    const { localApi } = await import("./local-api");
    (window as unknown as { __nbTest?: unknown }).__nbTest = { api: localApi };
  } else if (conn.mode === "cloud") {
    throw new NotConnectedError("Chế độ Cloudflare gọi thẳng máy chủ, không dùng kho trong trình duyệt");
  } else {
    cached = { key, svc: new ManuscriptService(new GitHubStore({ token: conn.token, owner: conn.owner, repo: conn.repo, branch: conn.branch })), conn };
  }
  return cached;
}

export function resetBackend() {
  cached = null;
  if (typeof window !== "undefined") delete (window as unknown as { __nbTest?: unknown }).__nbTest;
}
