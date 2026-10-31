import { MemoryStorage, MiniGit } from "@/lib/store/demo/minigit";
import { DemoStore } from "@/lib/store/demo/demo-store";
import { seedDemo } from "@/lib/store/demo/seed";
import { ManuscriptService } from "@/lib/core/service";

export async function freshDemo() {
  const git = new MiniGit(new MemoryStorage());
  const seed = await seedDemo(git);
  const store = new DemoStore(git);
  const svc = new ManuscriptService(store);
  return { git, seed, store, svc };
}
