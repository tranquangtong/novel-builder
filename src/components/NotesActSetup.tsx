"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useToast } from "./Toast";

type Status = { hasAct: boolean; actId: string | null; legacy: string[] };

/**
 * Hiện khi bộ truyện chưa có Act 0 (Outline & Trivia) hoặc còn file outline/canon kiểu cũ.
 * Một nút để tạo Act 0 và chuyển các file cũ vào đó (một phiên bản, có thể phục hồi từ lịch sử).
 */
export function NotesActSetup() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const st = useQuery({ queryKey: ["notes-act"], queryFn: () => api<Status>("/api/notes-act"), staleTime: 10_000 });
  if (!st.data || (st.data.hasAct && !st.data.legacy.length)) return null;
  const { hasAct, legacy } = st.data;
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ moved: unknown[] }>("/api/notes-act", { body: {} });
      toast(r.moved.length ? `Đã chuyển ${r.moved.length} file vào Act 0.` : "Đã tạo Act 0.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["notes-act"] }), qc.invalidateQueries({ queryKey: ["project"] }), qc.invalidateQueries({ queryKey: ["history"] })]);
    } catch (e) {
      toast(`Không chuyển được: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="banner warn" style={{ marginBottom: 16 }} data-testid="notes-act-setup">
      <div className="b-body">
        <div className="b-title">{hasAct ? "Còn outline/canon kiểu cũ chưa vào Act 0" : "Chưa có Act 0 · Outline & Trivia"}</div>
        <div className="small">
          {legacy.length
            ? <>Có {legacy.length} file trong <code>content/outlines</code> / <code>content/canon</code>. Chuyển sẽ biến mỗi file thành một ghi chú của Act 0 (giữ nguyên văn), trong một phiên bản; file cũ vẫn xem lại được trong lịch sử.</>
            : <>Act 0 chứa outline, trivia, ghi chú viết truyện và thiết lập nhân vật. Không đánh số chương và không tính vào số chữ của truyện.</>}
        </div>
        <div className="b-actions"><button className="btn sm primary" disabled={busy} onClick={run} data-testid="notes-act-run">{legacy.length ? "Chuyển vào Act 0" : "Tạo Act 0"}</button></div>
      </div>
    </div>
  );
}
