"use client";
import { openDB, type IDBPDatabase } from "idb";
import type { ChapterMeta } from "../domain/types";

/**
 * NHÁP TRÊN THIẾT BỊ (IndexedDB). Khác hoàn toàn với “phiên bản đã lưu” trong repo.
 * Mỗi nháp gắn với: repo (repoKey), chapter ID và phiên bản gốc (baseBlob + baseCommit).
 */
export interface Draft {
  key: string;
  repoKey: string;
  chapterId: string;
  baseBlob: string | null;
  baseCommit: string;
  body: string;
  meta: Omit<ChapterMeta, "id">;
  updatedAt: number;
  tabId: string;
}

const DB = "nb-studio";
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  dbp ??= openDB(DB, 1, {
    upgrade(d) {
      const s = d.createObjectStore("drafts", { keyPath: "key" });
      s.createIndex("repoKey", "repoKey");
    },
  });
  return dbp;
}

export const draftKey = (repoKey: string, chapterId: string) => `${repoKey}::${chapterId}`;

export async function getDraft(key: string): Promise<Draft | undefined> {
  return (await db()).get("drafts", key);
}

export async function listDrafts(repoKey: string): Promise<Draft[]> {
  return (await db()).getAllFromIndex("drafts", "repoKey", repoKey);
}

/**
 * Ghi nháp có kiểm tra: nếu một tab KHÁC đã ghi nháp mới hơn thời điểm tab này
 * đồng bộ lần cuối, KHÔNG ghi đè mà trả về nháp của tab kia.
 */
export async function putDraftGuarded(d: Draft, lastSyncedAt: number): Promise<{ ok: true } | { ok: false; other: Draft }> {
  const database = await db();
  const tx = database.transaction("drafts", "readwrite");
  const cur = (await tx.store.get(d.key)) as Draft | undefined;
  if (cur && cur.tabId !== d.tabId && cur.updatedAt > lastSyncedAt) {
    await tx.done;
    return { ok: false, other: cur };
  }
  await tx.store.put(d);
  await tx.done;
  return { ok: true };
}

/** Xóa nháp chỉ khi nội dung vẫn đúng là bản vừa được lưu thành công. */
export async function deleteDraftIfMatches(key: string, body: string, metaJson: string) {
  const database = await db();
  const tx = database.transaction("drafts", "readwrite");
  const cur = (await tx.store.get(key)) as Draft | undefined;
  if (cur && cur.body === body && JSON.stringify(cur.meta) === metaJson) await tx.store.delete(key);
  await tx.done;
}

export async function deleteDraft(key: string) {
  await (await db()).delete("drafts", key);
}

// ---- liên lạc giữa các tab ----
export type TabMessage =
  | { type: "draft"; key: string; tabId: string; updatedAt: number }
  | { type: "saved"; key: string; tabId: string; blob: string }
  | { type: "opened"; key: string; tabId: string };

let channel: BroadcastChannel | null = null;
export function tabChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel("nb-studio-drafts");
  return channel;
}

export function newTabId() {
  return `tab-${Math.random().toString(36).slice(2, 10)}`;
}
