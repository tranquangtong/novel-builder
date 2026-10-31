import { parseFrontmatter } from "./frontmatter";
import { countWords } from "./wordcount";

export interface ImportedChapter {
  seq: number;
  /** số chương ghi trong file nguồn (nếu có) */
  number: number | null;
  title: string;
  body: string;
  actLabel: string | null;
  words: number;
  sourceLine: number;
  frontmatterId?: string;
  isPreamble?: boolean;
  warnings: string[];
}

export interface ImportResult {
  chapters: ImportedChapter[];
  acts: string[];
  warnings: string[];
  lineEndingsNormalized: boolean;
}

const NUM = String.raw`(\d+|[IVXLCDM]+)`;
const SEP = String.raw`(?:\s*[:.\-–—]\s*|\s+|$)`;
const CHAPTER_RE = new RegExp(String.raw`^\s{0,3}(?:#{1,6}\s*)?(?:\*\*)?(?:chương|chapter|ch\.)\s*${NUM}${SEP}(.*?)(?:\*\*)?\s*$`, "iu");
const ACT_RE = new RegExp(String.raw`^\s{0,3}(?:#{1,6}\s*)?(?:\*\*)?(?:act|hồi|phần|quyển)\s+${NUM}${SEP}(.*?)(?:\*\*)?\s*$`, "iu");

function roman(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const u = s.toUpperCase();
  let n = 0;
  for (let i = 0; i < u.length; i++) {
    const v = map[u[i]], w = map[u[i + 1]] ?? 0;
    if (!v) return null;
    n += v < w ? -v : v;
  }
  return n || null;
}

function trimBlankLines(lines: string[]): string {
  let a = 0, b = lines.length;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b).join("\n");
}

/**
 * Nhận diện chương trong Markdown/plain text. KHÔNG sửa câu chữ, dấu câu hay tình tiết:
 * thân chương là đúng các dòng giữa hai tiêu đề (chỉ bỏ dòng trống ở đầu/cuối và
 * chuẩn hóa xuống dòng CRLF → LF).
 */
export function parseImport(raw: string, filename = "import.txt"): ImportResult {
  const lineEndingsNormalized = raw.includes("\r");
  const text = raw.replace(/\r\n?/g, "\n");
  const warnings: string[] = [];

  if (text.normalize("NFC") !== text) {
    warnings.push("Văn bản chứa ký tự tiếng Việt dạng tổ hợp (NFD). Ứng dụng giữ nguyên, nhưng tìm kiếm có thể không khớp một số từ.");
  }

  // File chương xuất từ ứng dụng (có frontmatter)
  if (text.startsWith("---\n")) {
    try {
      const fm = parseFrontmatter(text);
      if (fm.hasFrontmatter && (fm.data.id || fm.data.title)) {
        const body = fm.body.replace(/^\n+/, "");
        return {
          chapters: [{
            seq: 1, number: null, title: String(fm.data.title ?? filename), body, actLabel: null, words: countWords(body), sourceLine: 1,
            frontmatterId: typeof fm.data.id === "string" ? fm.data.id : undefined,
            warnings: body.trim() ? [] : ["Chương không có nội dung"],
          }],
          acts: [], warnings, lineEndingsNormalized,
        };
      }
    } catch (e) {
      warnings.push(`Frontmatter không đọc được: ${(e as Error).message}`);
    }
  }

  const lines = text.split("\n");
  type H = { line: number; kind: "chapter" | "act"; number: number | null; title: string };
  const heads: H[] = [];
  lines.forEach((l, i) => {
    if (l.length > 160) return;
    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const isMdHeading = /^\s{0,3}#/.test(l);
    const ma = ACT_RE.exec(l);
    if (ma && (isMdHeading || prevBlank)) {
      heads.push({ line: i, kind: "act", number: roman(ma[1]), title: (ma[2] ?? "").trim() });
      return;
    }
    const mc = CHAPTER_RE.exec(l);
    if (mc && (isMdHeading || prevBlank)) heads.push({ line: i, kind: "chapter", number: roman(mc[1]), title: (mc[2] ?? "").trim() });
  });

  const chapters: ImportedChapter[] = [];
  const acts: string[] = [];
  const chapterHeads = heads.filter((h) => h.kind === "chapter");

  if (!chapterHeads.length) {
    const body = trimBlankLines(lines);
    warnings.push("Không nhận diện được tiêu đề chương (ví dụ “Chương 1: …”). Toàn bộ file được xem là một chương.");
    chapters.push({ seq: 1, number: null, title: filename.replace(/\.(md|txt|markdown)$/i, ""), body, actLabel: null, words: countWords(body), sourceLine: 1, warnings: body ? [] : ["Chương không có nội dung"] });
    return { chapters, acts, warnings, lineEndingsNormalized };
  }

  const firstLine = heads[0].line;
  const pre = trimBlankLines(lines.slice(0, firstLine));
  if (pre) {
    chapters.push({
      seq: 0, number: null, title: "(Phần trước chương đầu tiên)", body: pre, actLabel: null, words: countWords(pre), sourceLine: 1, isPreamble: true,
      warnings: ["Có nội dung trước tiêu đề chương đầu tiên. Mặc định sẽ KHÔNG nhập phần này — chọn “Thêm làm chương mới” nếu cần."],
    });
  }

  let currentAct: string | null = null;
  const seenNumbers = new Map<number, number>();
  heads.forEach((h, idx) => {
    const end = idx + 1 < heads.length ? heads[idx + 1].line : lines.length;
    if (h.kind === "act") {
      currentAct = h.title ? `${lines[h.line].replace(/^\s*#+\s*/, "").trim()}` : lines[h.line].replace(/^\s*#+\s*/, "").trim();
      acts.push(currentAct);
      const between = trimBlankLines(lines.slice(h.line + 1, end));
      if (between) warnings.push(`Có nội dung giữa tiêu đề “${currentAct}” và chương kế tiếp (dòng ${h.line + 2}); phần này sẽ không được nhập.`);
      return;
    }
    const body = trimBlankLines(lines.slice(h.line + 1, end));
    const w: string[] = [];
    if (!h.title) w.push("Thiếu tên chương");
    if (!body.trim()) w.push("Chương không có nội dung");
    if (h.number !== null) {
      if (seenNumbers.has(h.number)) w.push(`Số chương ${h.number} xuất hiện nhiều lần trong file (dòng ${seenNumbers.get(h.number)! + 1} và ${h.line + 1})`);
      else seenNumbers.set(h.number, h.line);
    } else w.push("Không đọc được số chương");
    chapters.push({ seq: chapters.length + 1, number: h.number, title: h.title || `Chương ${h.number ?? "?"}`, body, actLabel: currentAct, words: countWords(body), sourceLine: h.line + 1, warnings: w });
  });

  const nums = chapters.filter((c) => c.number !== null && !c.isPreamble).map((c) => c.number!) ;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1 && nums[i] !== nums[i - 1]) warnings.push(`Số chương nhảy từ ${nums[i - 1]} sang ${nums[i]}`);
  }
  return { chapters, acts, warnings, lineEndingsNormalized };
}
