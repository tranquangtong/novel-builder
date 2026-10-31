import { expect, type Page } from "@playwright/test";
import type { ChapterVersion, ProjectSnapshot } from "../../src/lib/domain/types";

export const B = process.env.NEXT_PUBLIC_BASE_PATH || "/novel-builder";
export const go = (page: Page, p: string) => page.goto(`${B}${p}`);

declare global {
  interface Window {
    __nbTest?: { api: (method: string, path: string, body?: unknown) => Promise<unknown> };
  }
}

/** Chọn chế độ demo (kho demo nằm trong IndexedDB của context trình duyệt này). */
export async function useDemo(page: Page) {
  await go(page, "/settings/");
  await page.getByTestId("use-demo").click();
  await waitBackend(page);
}

export async function waitBackend(page: Page) {
  await page.waitForFunction(() => !!window.__nbTest, null, { timeout: 30_000 });
}

/** Gọi thao tác nghiệp vụ ngay trong trang (cửa test chỉ có ở chế độ demo). */
export async function call<T = unknown>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  await waitBackend(page);
  return page.evaluate(([m, p, b]) => window.__nbTest!.api(m as string, p as string, b), [method, path, body] as const) as Promise<T>;
}

export const snapshot = (page: Page) => call<ProjectSnapshot>(page, "GET", "/api/project");

export async function chapterByNumber(page: Page, n: number) {
  const c = (await snapshot(page)).chapters.find((x) => x.number === n);
  if (!c) throw new Error(`no chapter ${n}`);
  return c;
}

export const readChapter = (page: Page, id: string, commit?: string) => call<ChapterVersion>(page, "GET", `/api/chapters/${id}${commit ? `?commit=${commit}` : ""}`);

export async function openChapter(page: Page, id: string) {
  await go(page, `/chapter/?id=${id}`);
  await expect(page.getByTestId("save-state")).toBeVisible();
  await expect(page.getByTestId("chapter-title")).not.toHaveValue("");
}

export async function typeAtEnd(page: Page, text: string) {
  await page.getByTestId("editor-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(text);
}
