/**
 * Quy tắc đếm chữ (được hiển thị cho tác giả):
 *  - Chỉ đếm phần thân chương: KHÔNG gồm frontmatter/metadata và KHÔNG gồm tiêu đề chương
 *    (tiêu đề nằm trong metadata, không nằm trong thân).
 *  - Tách theo khoảng trắng (mọi loại khoảng trắng Unicode).
 *  - Một "chữ" là một cụm ký tự có ít nhất một chữ cái hoặc chữ số. Các cụm chỉ gồm
 *    ký hiệu Markdown/dấu câu như `#`, `***`, `>`, `—`, `-` không được tính.
 *  - Comment HTML `<!-- ... -->` (ghi chú ẩn) không được tính.
 *  - Tiếng Việt: mỗi âm tiết cách nhau bằng khoảng trắng là một chữ ("tiểu thuyết" = 2),
 *    giống cách Google Docs đếm.
 */
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

export function countWords(body: string): number {
  const text = body.replace(/<!--[\s\S]*?-->/g, " ");
  let n = 0;
  for (const token of text.split(/\s+/u)) {
    if (token && HAS_WORD_CHAR.test(token)) n++;
  }
  return n;
}

export type TargetState = "under" | "within" | "over";

export function targetState(words: number, target: { min: number; max: number }): TargetState {
  if (words < target.min) return "under";
  if (words > target.max) return "over";
  return "within";
}

export function formatNumber(n: number): string {
  return n.toLocaleString("vi-VN");
}
