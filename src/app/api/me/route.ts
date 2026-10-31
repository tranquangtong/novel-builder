import { guarded, json } from "@/lib/server/api";
import { getStore } from "@/lib/server/store";

export const GET = guarded(async (_req, { session }) => {
  const store = await getStore();
  return json({ login: session.login, name: session.name, mode: session.mode, repoKey: store.repoKey, branch: store.defaultBranch });
});
