import "server-only";
import path from "node:path";
import { getConfig } from "./config";
import { ManuscriptService } from "./service";
import { DemoStore } from "../store/demo/demo-store";
import { MiniGit } from "../store/demo/minigit";
import { seedDemo } from "../store/demo/seed";
import { GitHubStore } from "../store/github/github-store";
import type { RepoStore } from "../store/types";

type G = { __nbStore?: { key: string; store: RepoStore; git?: MiniGit }; __nbSeeding?: Promise<void> };
const g = globalThis as unknown as G;

export function demoGit(): MiniGit {
  const cfg = getConfig();
  return new MiniGit(path.resolve(process.cwd(), cfg.demo.dataDir));
}

export async function ensureDemoSeeded(git: MiniGit) {
  if (git.isInitialized()) return;
  g.__nbSeeding ??= seedDemo(git).then(() => undefined).finally(() => {
    g.__nbSeeding = undefined;
  });
  await g.__nbSeeding;
}

export async function getStore(): Promise<RepoStore> {
  const cfg = getConfig();
  const key = cfg.mode === "github" ? `gh:${cfg.github?.owner}/${cfg.github?.repo}@${cfg.github?.branch}` : `demo:${cfg.demo.dataDir}`;
  if (g.__nbStore?.key === key) {
    if (cfg.mode === "demo" && g.__nbStore.git) await ensureDemoSeeded(g.__nbStore.git);
    return g.__nbStore.store;
  }
  let store: RepoStore;
  let git: MiniGit | undefined;
  if (cfg.mode === "github") {
    if (!cfg.github || cfg.missing.length) throw new Error(`Thiếu cấu hình GitHub: ${cfg.missing.join(", ")}`);
    store = new GitHubStore({ ...cfg.github, branch: cfg.github.branch });
  } else {
    git = demoGit();
    await ensureDemoSeeded(git);
    store = new DemoStore(git);
  }
  g.__nbStore = { key, store, git };
  return store;
}

export async function getService() {
  return new ManuscriptService(await getStore());
}
