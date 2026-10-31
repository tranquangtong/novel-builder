"use client";
import { useMemo, useState } from "react";
import { diffLines } from "diff";
import { diffStats, paragraphDiff, type DiffBlock } from "@/lib/domain/textdiff";
import { Markdown } from "./Markdown";

type Mode = "inline" | "side" | "before" | "after";

function Block({ b }: { b: DiffBlock }) {
  if (b.kind === "same") return <div className="diff-p same">{b.text}</div>;
  if (b.kind === "add") return <div className="diff-p add"><span className="diff-tag">thêm</span>{b.text}</div>;
  if (b.kind === "del") return <div className="diff-p del"><span className="diff-tag">xóa</span>{b.text}</div>;
  return (
    <div className="diff-p change">
      <span className="diff-tag">sửa</span>
      {b.segs.map((s, i) => (s.kind === "add" ? <ins key={i}>{s.text}</ins> : s.kind === "del" ? <del key={i}>{s.text}</del> : <span key={i}>{s.text}</span>))}
    </div>
  );
}

/** So sánh văn xuôi theo đoạn, tô từ thêm/xóa; có thể xem bản render trước/sau. */
export function DiffView({ before, after, beforeLabel = "Trước", afterLabel = "Sau", prose = true, initial = "inline" }: { before: string; after: string; beforeLabel?: string; afterLabel?: string; prose?: boolean; initial?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [showSame, setShowSame] = useState(false);
  const blocks = useMemo(() => paragraphDiff(before, after), [before, after]);
  const stats = diffStats(blocks);
  const identical = before === after;

  const collapsed = useMemo(() => {
    if (showSame) return blocks.map((b) => ({ b, hidden: 0 }));
    const out: { b: DiffBlock | null; hidden: number }[] = [];
    blocks.forEach((b, i) => {
      const nearChange = (blocks[i - 1] && blocks[i - 1].kind !== "same") || (blocks[i + 1] && blocks[i + 1].kind !== "same");
      if (b.kind !== "same" || nearChange) out.push({ b, hidden: 0 });
      else {
        const last = out.at(-1);
        if (last && last.b === null) last.hidden++;
        else out.push({ b: null, hidden: 1 });
      }
    });
    return out;
  }, [blocks, showSame]);

  if (!prose) {
    const parts = diffLines(before, after);
    return (
      <div className="code-block line-diff">
        {parts.map((p, i) =>
          p.value.split("\n").slice(0, p.value.endsWith("\n") ? -1 : undefined).map((l, j) => (
            <span key={`${i}-${j}`} className={`l ${p.added ? "add" : p.removed ? "del" : ""}`}>{p.added ? "+ " : p.removed ? "− " : "  "}{l}</span>
          )),
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="tabs" style={{ marginBottom: 0, border: 0 }}>
          {(["inline", "side", "before", "after"] as Mode[]).map((m) => (
            <button key={m} className={`tab ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
              {m === "inline" ? "Thay đổi" : m === "side" ? "Song song" : m === "before" ? `${beforeLabel} (đọc)` : `${afterLabel} (đọc)`}
            </button>
          ))}
        </div>
        <span className="grow" />
        {identical ? <span className="chip">Không khác biệt</span> : (
          <span className="small muted" data-testid="diff-stats">
            <span style={{ color: "var(--add-ink)" }}>+{stats.added}</span> đoạn · <span style={{ color: "var(--del-ink)" }}>−{stats.removed}</span> đoạn · {stats.changed} đoạn sửa
          </span>
        )}
        {mode === "inline" && <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} /> hiện đoạn không đổi</label>}
      </div>
      {mode === "inline" && (
        <div className="diff" data-testid="diff-inline">
          {collapsed.map((x, i) => (x.b ? <Block key={i} b={x.b} /> : <div key={i} className="diff-p same collapsed">… {x.hidden} đoạn không đổi</div>))}
        </div>
      )}
      {mode === "side" && (
        <div className="side-by-side">
          <div><div className="pane-label">{beforeLabel}</div><div className="diff">{blocks.filter((b) => b.kind !== "add").map((b, i) => <Block key={i} b={b.kind === "change" ? { kind: "del", text: b.before } : b} />)}</div></div>
          <div><div className="pane-label">{afterLabel}</div><div className="diff">{blocks.filter((b) => b.kind !== "del").map((b, i) => <Block key={i} b={b.kind === "change" ? { kind: "add", text: b.after } : b} />)}</div></div>
        </div>
      )}
      {mode === "before" && <Markdown text={before} />}
      {mode === "after" && <Markdown text={after} />}
    </div>
  );
}
