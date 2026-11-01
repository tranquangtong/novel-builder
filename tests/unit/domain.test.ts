import { describe, expect, it } from "vitest";
import { countWords } from "@/lib/domain/wordcount";
import { parseChapter, serializeChapter } from "@/lib/domain/chapter";
import { parseImport } from "@/lib/domain/importer";
import { paragraphDiff } from "@/lib/domain/textdiff";
import { gitBlobSha } from "@/lib/domain/gitsha";
import { assertSafeContentPath } from "@/lib/domain/paths";

describe("đếm chữ", () => {
  it("tách theo khoảng trắng, bỏ ký hiệu đứng riêng và comment HTML", () => {
    expect(countWords("Puna — cô gái từ Velmar.\n\n***\n\n> “Ừ,” Rei nói. <!-- ghi chú ẩn -->")).toBe(8); // Puna, cô, gái, từ, Velmar., “Ừ,”, Rei, nói.
    expect(countWords("tiểu thuyết")).toBe(2);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("anh—em 2026")).toBe(2);
    expect(countWords("Puna ngồi.\n\n![Phác thảo: lá thư dấu thập đỏ](asset:ch_x/abc-la-thu.png)\n\nRei đứng.")).toBe(4);
  });
});

describe("file chương", () => {
  it("parse/serialize giữ nguyên thân chương từng byte và khóa lạ", () => {
    const body = "  Dòng thụt đầu.\n\n\nBa dòng trống ở trên.\n---\nKhông phải frontmatter.\n";
    const text = serializeChapter({ meta: { id: "ch_abc123", title: "Tên: có dấu hai chấm", act_id: "act_x", order: 1.5, status: "in_review", pov: "Puna" }, body, extra: { tags: ["a"] } });
    const d = parseChapter(text);
    expect(d.body).toBe(body);
    expect(d.meta.title).toBe("Tên: có dấu hai chấm");
    expect(d.meta.order).toBe(1.5);
    expect(d.extra).toEqual({ tags: ["a"] });
    expect(serializeChapter(d)).toBe(text);
  });
  it("git blob sha khớp git hash-object", () => {
    // printf 'hello\n' | git hash-object --stdin
    expect(gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});

describe("nhập văn bản", () => {
  it("nhận diện chương/Act, giữ nguyên văn, cảnh báo trùng và thiếu", () => {
    const r = parseImport("# Hồi I: Tro\n\n## Chương 1: Mở đầu\n\nA  b.\n\n## Chương 2\n\n## Chương 2: Lặp\n\nC.\n", "x.md");
    expect(r.acts).toEqual(["Hồi I: Tro"]);
    expect(r.chapters.map((c) => c.number)).toEqual([1, 2, 2]);
    expect(r.chapters[0].body).toBe("A  b.");
    expect(r.chapters[0].actLabel).toBe("Hồi I: Tro");
    expect(r.chapters[1].warnings.join()).toMatch(/Thiếu tên chương/);
    expect(r.chapters[1].warnings.join()).toMatch(/không có nội dung/);
    expect(r.chapters[2].warnings.join()).toMatch(/nhiều lần/);
  });
  it("không có tiêu đề → một chương, có cảnh báo", () => {
    const r = parseImport("Chỉ là văn bản.", "ban-thao.txt");
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].title).toBe("ban-thao");
    expect(r.warnings[0]).toMatch(/Không nhận diện/);
  });
  it("không coi câu văn bắt đầu bằng 'Chương' giữa đoạn là tiêu đề", () => {
    const r = parseImport("Chương 1: Mở\n\nCô đọc tiếp.\nChương 3 của cuốn sách kể về biển.\n", "x.txt");
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].body).toContain("Chương 3 của cuốn sách");
  });
});

describe("diff theo đoạn", () => {
  it("ghép cặp đoạn sửa và tô từ", () => {
    const d = paragraphDiff("A một.\n\nB hai.\n\nC ba.", "A một.\n\nB hai sửa.\n\nC ba.\n\nD mới.");
    expect(d.map((x) => x.kind)).toEqual(["same", "change", "same", "add"]);
    const ch = d[1];
    if (ch.kind !== "change") throw new Error();
    expect(ch.segs.some((s) => s.kind === "add" && s.text.includes("sửa"))).toBe(true);
  });
});

describe("đường dẫn an toàn", () => {
  it("chặn path traversal", () => {
    expect(() => assertSafeContentPath("content/../.env")).toThrow();
    expect(() => assertSafeContentPath("/etc/passwd")).toThrow();
    expect(assertSafeContentPath("content/canon/world/kiem-tro.md")).toBe("content/canon/world/kiem-tro.md");
  });
});

describe("sha1 thuần JS", () => {
  it("khớp node:crypto và git hash-object với nhiều độ dài", async () => {
    const { createHash } = await import("node:crypto");
    const { execSync } = await import("node:child_process");
    const { sha1OfString } = await import("@/lib/domain/gitsha");
    for (const s of ["", "hello\n", "Tiếng Việt — “Ừ”\n".repeat(50), "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(119)]) {
      expect(sha1OfString(s)).toBe(createHash("sha1").update(s).digest("hex"));
      expect(gitBlobSha(s)).toBe(execSync("git hash-object --stdin", { input: s }).toString().trim());
    }
  });
});

describe("AGENTS.md", () => {
  it("bản trong mã giống hệt templates/manuscript/AGENTS.md", async () => {
    const fs = await import("node:fs");
    const { AGENTS_MD } = await import("@/lib/domain/agents-md");
    expect(AGENTS_MD).toBe(fs.readFileSync("templates/manuscript/AGENTS.md", "utf8"));
  });
});
