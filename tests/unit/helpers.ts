import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MiniGit } from "@/lib/store/demo/minigit";
import { DemoStore } from "@/lib/store/demo/demo-store";
import { seedDemo } from "@/lib/store/demo/seed";
import { ManuscriptService } from "@/lib/server/service";

export async function freshDemo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nb-demo-"));
  const git = new MiniGit(dir);
  const seed = await seedDemo(git);
  const store = new DemoStore(git);
  const svc = new ManuscriptService(store);
  return { dir, git, seed, store, svc };
}
