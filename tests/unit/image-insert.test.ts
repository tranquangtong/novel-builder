import { describe, expect, it } from "vitest";
import { Text } from "@codemirror/state";
import { imageInsertion } from "../../src/components/MarkdownEditor";

const IMG = "![Zen](asset:ch_x/a.png)";
const apply = (doc: string, head: number, place?: "after" | "nearest") => {
  const t = Text.of(doc.split("\n"));
  const { pos, insert } = imageInsertion(t, head, IMG, place);
  return doc.slice(0, pos) + insert + doc.slice(pos);
};

describe("chèn ảnh vào giữa chương", () => {
  const doc = "Đoạn một.\n\nĐoạn hai dài hơn một chút.\n\nĐoạn ba.";
  it("con trỏ giữa đoạn → ảnh nằm SAU đoạn đó, thành khối riêng, không cắt câu", () => {
    expect(apply(doc, doc.indexOf("hai") + 2)).toBe(`Đoạn một.\n\nĐoạn hai dài hơn một chút.\n\n${IMG}\n\nĐoạn ba.`);
  });
  it("con trỏ ở dòng trống giữa hai đoạn → chèn đúng chỗ đó", () => {
    expect(apply(doc, doc.indexOf("\n\n") + 1)).toBe(`Đoạn một.\n\n${IMG}\n\nĐoạn hai dài hơn một chút.\n\nĐoạn ba.`);
  });
  it("cuối chương", () => {
    expect(apply(doc, doc.length)).toBe(`${doc}\n\n${IMG}\n`);
  });
  it("thả chuột gần đầu đoạn → trước đoạn; gần cuối → sau đoạn", () => {
    const start = doc.indexOf("Đoạn hai");
    expect(apply(doc, start + 1, "nearest")).toBe(`Đoạn một.\n\n${IMG}\n\nĐoạn hai dài hơn một chút.\n\nĐoạn ba.`);
    expect(apply(doc, doc.indexOf("chút"), "nearest")).toBe(`Đoạn một.\n\nĐoạn hai dài hơn một chút.\n\n${IMG}\n\nĐoạn ba.`);
    expect(apply(doc, 0, "nearest")).toBe(`${IMG}\n\n${doc}`);
  });
});
