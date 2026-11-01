/** Nhãn hiển thị: chương thường là “Ch 12 · Tên”, ghi chú trong Act 0 (số 0) chỉ có tên. */
export function chapterLabel(c: { number: number; title: string }): string {
  return c.number > 0 ? `Ch ${c.number} · ${c.title}` : c.title;
}
export function chapterShort(c: { number: number }): string {
  return c.number > 0 ? `Ch ${c.number}` : "Ghi chú";
}
