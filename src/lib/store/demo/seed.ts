import { serializeChapter } from "../../domain/chapter";
import { serializeFrontmatter } from "../../domain/frontmatter";
import { gitBlobSha } from "../../domain/gitsha";
import { newId } from "../../domain/ids";
import { INDEX_FILE, PROJECT_FILE, actPath, chapterPath, summaryPath } from "../../domain/paths";
import type { ChapterDoc } from "../../domain/types";
import { ManuscriptService, serializeIndex } from "../../core/service";
import { countWords } from "../../domain/wordcount";
import { DEMO_AGENT, DemoStore } from "./demo-store";
import type { MiniGit } from "./minigit";
import { AGENTS_MD } from "../../domain/agents-md";

/**
 * DỮ LIỆU DEMO — 200 chương ngắn để thử danh sách, điều hướng, review và phục hồi.
 * Đây KHÔNG phải bản thảo thật. Tên Puna, Ben, Kiếm Tro chỉ dùng làm ví dụ minh họa.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SENTENCES = [
  "Gió từ phía cảng thổi qua những mái ngói còn ám khói.",
  "Puna siết chặt quai túi, đếm từng bước trên con dốc đá.",
  "Tiếng chuông xa vọng lại, chậm và nặng như một lời nhắc.",
  "Không ai trong nhóm nói gì suốt quãng đường còn lại.",
  "Ánh đèn dầu chập chờn trên vách, kéo dài những cái bóng.",
  "Cô nhớ lời Ben dặn, nhưng không chắc mình hiểu hết ý anh.",
  "Mùi tro lẫn trong mưa, ngai ngái và quen thuộc đến lạ.",
  "Họ dừng lại ở ngã ba, nơi tấm bia cũ đã nứt làm đôi.",
  "Một con quạ đậu trên cột buồm gãy, im lặng quan sát.",
  "Đêm xuống nhanh hơn họ tưởng, và sương bắt đầu dâng.",
  "Có điều gì đó trong giọng ông lão khiến cô rùng mình.",
  "Lưỡi kiếm xám mờ, không phản chiếu chút ánh sáng nào.",
  "Cậu bé chạy trước, tiếng dép lẹp xẹp vang khắp hẻm.",
  "Họ chia nhau mẩu bánh cuối cùng mà không ai phàn nàn.",
  "Trên bản đồ, con đường ấy chỉ là một nét mực mờ.",
  "Cô biết mình sẽ phải chọn, sớm hơn cô mong muốn.",
];

const TITLE_WORDS = ["Tro", "Sương", "Chuông", "Bến cảng", "Ngọn đèn", "Lời hứa", "Bóng tối", "Cánh cửa", "Mưa đêm", "Dấu vết", "Tiếng gọi", "Mảnh vỡ", "Ngã ba", "Ký ức", "Hơi thở", "Vết nứt"];
const TITLE_MODS = ["cuối cùng", "phía bắc", "không tên", "của Ben", "trong mưa", "đã tắt", "lặng im", "thứ hai", "lạc lối", "xa xăm"];

function paragraph(rand: () => number, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(SENTENCES[Math.floor(rand() * SENTENCES.length)]);
  return out.join(" ");
}

export const DEMO_ACTS = [
  { title: "Act I · Tro tàn", description: "Velmar sau trận hỏa hoạn. Puna rời thành." },
  { title: "Act II · Biển sương", description: "Hành trình vượt biển." },
  { title: "Act III · Thành phố chuông", description: "Những bí mật ở thành phố chuông." },
  { title: "Act IV · Phép màu cuối cùng", description: "Kết thúc." },
];

const CH10_V1 = `Mưa không ngừng suốt buổi sáng. Puna ngồi bên cửa sổ quán trọ, nhìn dòng người chen chúc dưới mái hiên.

Cô đặt thanh kiếm xám lên bàn. Lưỡi kiếm không phản chiếu chút ánh sáng nào, như thể nó nuốt lấy mọi thứ.

“Cô định mang nó theo mãi sao?” Rei hỏi, giọng nửa đùa nửa thật.

Puna không trả lời. Cô chỉ biết đây là thứ duy nhất còn sót lại từ đống tro ở Velmar.`;

const CH10_V2 = `Mưa không ngừng suốt buổi sáng, tạt cả vào hiên. Puna ngồi bên cửa sổ quán trọ, nhìn dòng người chen chúc dưới mái hiên.

Cô đặt thanh kiếm xám lên bàn. Lưỡi kiếm không phản chiếu chút ánh sáng nào.

“Cô định mang nó theo mãi sao?” Rei hỏi.

“Cho tới khi tôi biết nó là của ai,” Puna đáp.

Rei nhún vai, nhưng ánh mắt anh dừng lại trên chuôi kiếm lâu hơn cần thiết.`;

const CH11_V1 = `Đêm ấy, ông lão giữ quán gõ cửa phòng họ. Ông mang theo một cuốn sổ cũ, gáy đã bong.

“Có người hỏi về thanh kiếm,” ông nói. “Một người mặc áo choàng xám.”

Puna và Rei nhìn nhau. Không ai trong hai người nói gì.`;

const CH11_V2 = `Đêm ấy, ông lão giữ quán gõ cửa phòng họ ba lần. Ông mang theo một cuốn sổ cũ, gáy đã bong, mép giấy cháy sém.

“Có người hỏi về thanh kiếm,” ông nói, hạ giọng. “Một người mặc áo choàng xám. Hắn trả bằng bạc của phương bắc.”

Puna và Rei nhìn nhau. Rei là người lên tiếng trước: “Hắn còn ở đây không?”

Ông lão lắc đầu.`;

export interface SeedInfo {
  chapterIds: string[];
  actIds: string[];
  commits: { init: string; ch1011: string; ch89canon: string };
}

export async function seedDemo(git: MiniGit): Promise<SeedInfo> {
  const rand = mulberry32(20261031);
  const idRand = () => {
    const b = new Uint8Array(10);
    for (let i = 0; i < 10; i++) b[i] = Math.floor(rand() * 256);
    return b;
  };

  const files: Record<string, string> = {};
  files[PROJECT_FILE] = JSON.stringify({
    title: "The Last Miracle",
    subtitle: "DỮ LIỆU DEMO — 200 chương ngắn để thử ứng dụng, không phải bản thảo thật",
    language: "vi",
    word_target: { min: 2500, max: 3000 },
    demo_data: true,
  }, null, 2) + "\n";
  files["AGENTS.md"] = AGENTS_MD;

  const actIds = DEMO_ACTS.map(() => newId("act", idRand));
  DEMO_ACTS.forEach((a, i) => {
    files[actPath(actIds[i])] = serializeFrontmatter({ id: actIds[i], title: a.title, order: i + 1 }, `${a.description}\n`);
  });

  const chapterIds: string[] = [];
  const docs: ChapterDoc[] = [];
  for (let n = 1; n <= 200; n++) {
    const id = newId("ch", idRand);
    chapterIds.push(id);
    const act = actIds[Math.min(3, Math.floor((n - 1) / 50))];
    const title = `${TITLE_WORDS[Math.floor(rand() * TITLE_WORDS.length)]} ${TITLE_MODS[Math.floor(rand() * TITLE_MODS.length)]}`;
    let body: string;
    if (n === 10) body = CH10_V1;
    else if (n === 11) body = CH11_V1;
    else {
      const paras = 2 + Math.floor(rand() * 3);
      body = Array.from({ length: paras }, () => paragraph(rand, 3 + Math.floor(rand() * 3))).join("\n\n");
    }
    body = `${body}\n`;
    const doc: ChapterDoc = {
      meta: { id, title, act_id: act, order: n, status: n <= 6 ? "approved" : n <= 12 ? "in_review" : "draft", pov: n % 3 === 0 ? "Rei" : "Puna" },
      body,
      extra: {},
    };
    docs.push(doc);
    files[chapterPath(id)] = serializeChapter(doc);
  }

  const ch = (n: number) => chapterIds[n - 1];

  files["content/canon/characters/puna.md"] = serializeFrontmatter(
    { title: "Puna", type: "character", status: "canon", aliases: ["Cô gái từ Velmar"] },
    `Nhân vật chính. Rời Velmar sau trận hỏa hoạn ở ${ch(1)}.\n\n- Mang theo một thanh kiếm xám nhặt được trong đống tro.\n- Không biết nguồn gốc thanh kiếm.\n`,
  );
  files["content/canon/characters/ben.md"] = serializeFrontmatter(
    { title: "Ben", type: "character", status: "canon" },
    "Người dẫn đường cũ của Puna. Mất tích trong trận hỏa hoạn ở Velmar.\n",
  );
  files["content/canon/characters/rei.md"] = serializeFrontmatter(
    { title: "Rei", type: "character", status: "canon" },
    "Bạn đồng hành của Puna từ Act I.\n",
  );
  files["content/canon/world/kiem-tro.md"] = serializeFrontmatter(
    { title: "Kiếm Tro", type: "item", status: "canon" },
    "**Kiếm Tro là di vật của Ben.** Lưỡi kiếm xám, không phản chiếu ánh sáng.\n\n> Đây là canon của thế giới, KHÔNG có nghĩa là nhân vật nào đã biết. Xem `content/canon/knowledge/`.\n",
  );
  files["content/canon/world/velmar.md"] = serializeFrontmatter(
    { title: "Velmar", type: "place", status: "canon" },
    "Thành cảng phía nam, bị thiêu rụi ở đầu Act I.\n",
  );
  files["content/canon/world/nguoi-ao-xam.md"] = serializeFrontmatter(
    { title: "Người áo choàng xám", type: "character", status: "proposed" },
    "Đề xuất (chưa chốt): kẻ truy tìm Kiếm Tro, trả bằng bạc phương bắc.\n",
  );
  files["content/canon/timeline/act-1.md"] = serializeFrontmatter(
    {
      title: "Sự kiện đã xảy ra — Act I",
      type: "timeline",
      events: [
        { when: "Ngày 1", event: "Velmar bốc cháy; Ben mất tích", source_chapter: ch(1) },
        { when: "Ngày 1", event: "Puna nhặt được thanh kiếm xám trong đống tro", source_chapter: ch(2) },
        { when: "Ngày 9", event: "Rei hỏi Puna về thanh kiếm ở quán trọ", source_chapter: ch(10) },
        { when: "Ngày 9", event: "Ông lão báo có người áo choàng xám hỏi về thanh kiếm", source_chapter: ch(11) },
      ],
    },
    "Chỉ ghi những gì đã thực sự xảy ra trong bản thảo, kèm chương nguồn.\n",
  );
  files["content/canon/knowledge/puna.md"] = serializeFrontmatter(
    {
      title: "Kiến thức của Puna",
      type: "knowledge",
      character: "Puna",
      entries: [
        { fact: "Ben mất tích trong trận hỏa hoạn ở Velmar", state: "knows", from_chapter: ch(1) },
        { fact: "Kiếm Tro là di vật của Ben", fact_ref: "content/canon/world/kiem-tro.md", state: "unaware", until_chapter: null, note: "Puna chỉ biết đây là thanh kiếm nhặt trong đống tro" },
        { fact: "Có người đang truy tìm thanh kiếm", state: "knows", from_chapter: ch(11) },
      ],
    },
    "",
  );
  files["content/canon/knowledge/rei.md"] = serializeFrontmatter(
    {
      title: "Kiến thức của Rei",
      type: "knowledge",
      character: "Rei",
      entries: [
        { fact: "Kiếm Tro là di vật của Ben", fact_ref: "content/canon/world/kiem-tro.md", state: "suspects", from_chapter: ch(10), note: "Ánh mắt dừng trên chuôi kiếm — chưa xác nhận" },
      ],
    },
    "",
  );
  files["content/outlines/act-1.md"] = serializeFrontmatter(
    { title: "Outline Act I", type: "outline", status: "planned", act_id: actIds[0] },
    "## Kế hoạch (chưa xảy ra)\n\n- Ch 13–15: Puna và Rei rời quán trọ trước bình minh.\n- Ch 20: Puna lần đầu nghe tên “Kiếm Tro” — vẫn chưa biết nó là của Ben.\n- Cuối Act I: tiết lộ một phần quá khứ của Ben.\n",
  );
  files["content/outlines/act-2.md"] = serializeFrontmatter(
    { title: "Outline Act II", type: "outline", status: "planned", act_id: actIds[1] },
    "- Vượt biển sương.\n- Rei giấu Puna điều anh nghi ngờ về thanh kiếm.\n",
  );
  files["content/reviews/README.md"] = "# Ghi chú review\n\nAgent ghi báo cáo continuity tại đây, mỗi nhiệm vụ một file.\n";

  for (let n = 1; n <= 12; n++) {
    const id = ch(n);
    const blob = gitBlobSha(files[chapterPath(id)]);
    files[summaryPath(id)] = serializeFrontmatter(
      { title: `Tóm tắt Ch ${n}`, type: "summary", chapter_id: id, source_blob: blob, source_commit: "init" },
      `Tóm tắt (dẫn xuất, DEMO) của Ch ${n}: ${docs[n - 1].body.split("\n")[0].slice(0, 120)}…\n`,
    );
  }

  files[INDEX_FILE] = serializeIndex(
    docs.map((d) => ({ id: d.meta.id, path: chapterPath(d.meta.id), blob: gitBlobSha(files[chapterPath(d.meta.id)]), title: d.meta.title, act_id: d.meta.act_id, order: d.meta.order, status: d.meta.status, pov: d.meta.pov, words: countWords(d.body) })),
  );

  const tree: Record<string, string> = {};
  for (const [p, c] of Object.entries(files)) tree[p] = await git.writeBlob(c);
  const t0 = Date.now() - 3 * 24 * 3600 * 1000;
  const init = await git.writeCommit({ tree, parents: [], message: "Khởi tạo cấu trúc bản thảo và DỮ LIỆU DEMO (200 chương)", author: "tac-gia-demo", date: new Date(t0).toISOString() });
  await git.writeState({ refs: { main: init.sha }, pulls: [] });

  const store = new DemoStore(git);
  const svc = new ManuscriptService(store);
  const author = { name: "tac-gia-demo", email: "demo@example.invalid" };

  const getDoc = async (n: number) => (await svc.getChapter(ch(n))).doc;
  const d10 = await getDoc(10), d11 = await getDoc(11);
  const r1 = await svc.commitWithChecks({
    expected: {},
    author,
    message: "Lưu phiên bản: Ch 10–11 — thêm đối thoại ở quán trọ",
    build: async () => ({
      [chapterPath(ch(10))]: serializeChapter({ ...d10, body: `${CH10_V2}\n` }),
      [chapterPath(ch(11))]: serializeChapter({ ...d11, body: `${CH11_V2}\n` }),
    }),
  });

  const d8 = await getDoc(8), d9 = await getDoc(9);
  const kiem = (await svc.readFile("content/canon/world/kiem-tro.md"))!;
  const r2 = await svc.commitWithChecks({
    expected: {},
    author,
    message: "Lưu phiên bản: Ch 8–9 và canon Kiếm Tro",
    build: async () => ({
      [chapterPath(ch(8))]: serializeChapter({ ...d8, body: `${d8.body.trimEnd()}\n\nPuna lau lưỡi kiếm bằng vạt áo, như một thói quen mới.\n` }),
      [chapterPath(ch(9))]: serializeChapter({ ...d9, body: `${d9.body.trimEnd()}\n\nRei đứng gác ở cửa cho tới khi trời sáng.\n` }),
      "content/canon/world/kiem-tro.md": kiem.content.replace("không phản chiếu ánh sáng.", "không phản chiếu ánh sáng. Chuôi quấn da đã sờn."),
    }),
  });

  // Một đề xuất mẫu từ "agent" (mô phỏng)
  const agentStore = new DemoStore(git, DEMO_AGENT);
  await agentStore.createBranch("agent/ch12-continuity", r2.commitSha);
  const d12 = await getDoc(12);
  const agentSvc = new ManuscriptService(agentStore);
  const ch12Text = serializeChapter({ ...d12, body: `${d12.body.trimEnd()}\n\nPuna không nhắc tới Ben. Cô vẫn chưa biết thanh kiếm từng thuộc về ai.\n` });
  const h = await agentStore.getBranchHead("agent/ch12-continuity");
  await agentStore.commitFiles({
    branch: "agent/ch12-continuity",
    expectedHead: h,
    message: "Continuity: Ch 12 — Puna chưa biết nguồn gốc Kiếm Tro",
    author: { name: DEMO_AGENT, email: "agent@example.invalid" },
    changes: {
      [chapterPath(ch(12))]: ch12Text,
      "content/reviews/ch12-continuity.md": `# Báo cáo continuity — Ch 12\n\nĐã đọc: Ch 10, Ch 11, Ch 12, content/canon/world/kiem-tro.md, content/canon/knowledge/puna.md.\nKHÔNG đọc các chương khác.\n\n- Lỗi continuity: không có.\n- Bổ sung một câu nhắc rằng Puna chưa biết nguồn gốc thanh kiếm (khớp knowledge/puna.md).\n`,
    },
  });
  void agentSvc;
  await agentStore.createPull({
    title: "Continuity Ch 12: làm rõ Puna chưa biết nguồn gốc Kiếm Tro",
    body: `**Mục đích:** kiểm tra continuity Ch 12 với canon Kiếm Tro.\n\n**Chương bị ảnh hưởng:** Ch 12 (\`${ch(12)}\`).\n\n**Đã đọc:** Ch 10–12, canon/world/kiem-tro.md, canon/knowledge/puna.md.\n\n**Thay đổi canon:** không.\n\n_(Đề xuất DEMO do agent mô phỏng tạo.)_`,
    head: "agent/ch12-continuity",
    base: "main",
    author: DEMO_AGENT,
  });

  return { chapterIds, actIds, commits: { init: init.sha, ch1011: r1.commitSha, ch89canon: r2.commitSha } };
}
