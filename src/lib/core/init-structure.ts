import { serializeFrontmatter } from "../domain/frontmatter";
import { newId } from "../domain/ids";
import { PROJECT_FILE, actPath } from "../domain/paths";
import { AGENTS_MD } from "../domain/agents-md";
import { ValidationError, serializeNotesAct, type Author, type ManuscriptService } from "./service";

/** Tạo cấu trúc tối thiểu trong repo đã có ít nhất một commit (ví dụ README). */
export async function initializeStructure(svc: ManuscriptService, title: string, author?: Author) {
  const head = await svc.head();
  const tree = await svc.store.getTree(head);
  if (tree.has(PROJECT_FILE)) throw new ValidationError("Repository đã có content/project.json");
  const actId = newId("act");
  const notesActId = newId("act");
  const agents = AGENTS_MD;
  const keep = (p: string) => ({ [`${p}/.gitkeep`]: "" });
  const res = await svc.commitWithChecks({
    expected: { [PROJECT_FILE]: null },
    author,
    message: "Khởi tạo cấu trúc bản thảo",
    build: async () => ({
      [PROJECT_FILE]: JSON.stringify({ title, language: "vi", word_target: { min: 2500, max: 3000 } }, null, 2) + "\n",
      [actPath(notesActId)]: serializeNotesAct(notesActId),
      [actPath(actId)]: serializeFrontmatter({ id: actId, title: "Act I", order: 1 }, "\n"),
      ...(tree.has("AGENTS.md") ? {} : { "AGENTS.md": agents }),
      ...keep("content/chapters"),
      ...keep("content/summaries"),
      ...keep("content/reviews"),
    }),
  });
  return { commitSha: res.commitSha };
}
