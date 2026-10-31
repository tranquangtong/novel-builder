import { expect, type Page } from "@playwright/test";
import type { ChapterVersion, ProjectSnapshot } from "../../src/lib/domain/types";

export async function login(page: Page) {
  const r = await page.request.post("/api/auth/demo", { data: { passcode: "e2e-pass" } });
  expect(r.ok()).toBeTruthy();
}

export async function snapshot(page: Page): Promise<ProjectSnapshot> {
  const r = await page.request.get("/api/project");
  expect(r.ok()).toBeTruthy();
  return r.json();
}

export async function chapterByNumber(page: Page, n: number) {
  const s = await snapshot(page);
  const c = s.chapters.find((x) => x.number === n);
  if (!c) throw new Error(`no chapter ${n}`);
  return c;
}

export async function readChapter(page: Page, id: string, commit?: string): Promise<ChapterVersion> {
  const r = await page.request.get(`/api/chapters/${id}${commit ? `?commit=${commit}` : ""}`);
  expect(r.ok()).toBeTruthy();
  return r.json();
}

export async function openChapter(page: Page, id: string) {
  await page.goto(`/chapters/${id}`);
  await expect(page.getByTestId("save-state")).toBeVisible();
  // đợi nội dung chương được nạp vào editor
  await expect(page.getByTestId("chapter-title")).not.toHaveValue("");
}

export async function typeAtEnd(page: Page, text: string) {
  const ed = page.getByTestId("editor-content");
  await ed.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(text);
}
