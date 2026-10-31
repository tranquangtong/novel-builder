"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { closeSearchPanel, highlightSelectionMatches, openSearchPanel, search, searchKeymap, searchPanelOpen } from "@codemirror/search";
import { tags } from "@lezer/highlight";

export interface EditorHandle {
  setValue(text: string): void;
  getValue(): string;
  wrap(prefix: string, suffix?: string): void;
  linePrefix(prefix: string): void;
  insertBlock(text: string): void;
  toggleSearch(): void;
  undo(): void;
  redo(): void;
  focus(): void;
}

const phrases = EditorState.phrases.of({
  Find: "Tìm",
  Replace: "Thay bằng",
  next: "tiếp",
  previous: "trước",
  all: "tất cả",
  "match case": "phân biệt hoa/thường",
  regexp: "biểu thức chính quy",
  "by word": "nguyên từ",
  replace: "thay",
  "replace all": "thay tất cả",
  close: "đóng",
  "current match": "kết quả hiện tại",
  "on line": "ở dòng",
  "replaced match on line $": "đã thay ở dòng $",
  "replaced $ matches": "đã thay $ kết quả",
});

const hl = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: "var(--muted)" },
  { tag: tags.quote, color: "var(--ink-2)", fontStyle: "italic" },
]);

export const MarkdownEditor = forwardRef<EditorHandle, { initial: string; onChange: (text: string) => void; onSave?: () => void; readOnly?: boolean }>(function MarkdownEditor({ initial, onChange, onSave, readOnly }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onSave });
  const ro = useRef(new Compartment());
  useEffect(() => {
    cb.current = { onChange, onSave };
  });

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          phrases,
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown(),
          syntaxHighlighting(hl),
          search({ top: true }),
          highlightSelectionMatches(),
          cmPlaceholder("Bắt đầu viết…"),
          ro.current.of(EditorState.readOnly.of(!!readOnly)),
          keymap.of([
            { key: "Mod-s", preventDefault: true, run: () => (cb.current.onSave?.(), true) },
            { key: "Mod-b", run: (vw) => (wrapIn(vw, "**", "**"), true) },
            { key: "Mod-i", run: (vw) => (wrapIn(vw, "*", "*"), true) },
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ "aria-label": "Nội dung chương", spellcheck: "true", lang: "vi", "data-testid": "editor-content" }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tạo editor một lần; nội dung cập nhật qua setValue
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: ro.current.reconfigure(EditorState.readOnly.of(!!readOnly)) });
  }, [readOnly]);

  useImperativeHandle(ref, () => ({
    setValue(text) {
      const v = view.current!;
      if (v.state.doc.toString() === text) return;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    },
    getValue: () => view.current?.state.doc.toString() ?? "",
    wrap: (p, s) => view.current && wrapIn(view.current, p, s ?? p),
    linePrefix(prefix) {
      const v = view.current!;
      const { from, to } = v.state.selection.main;
      const changes = [];
      for (let pos = from; pos <= to; ) {
        const line = v.state.doc.lineAt(pos);
        changes.push(line.text.startsWith(prefix) ? { from: line.from, to: line.from + prefix.length, insert: "" } : { from: line.from, insert: prefix });
        pos = line.to + 1;
      }
      v.dispatch({ changes });
      v.focus();
    },
    insertBlock(text) {
      const v = view.current!;
      const pos = v.state.selection.main.head;
      v.dispatch({ changes: { from: pos, insert: `\n\n${text}\n\n` }, selection: { anchor: pos + text.length + 4 } });
      v.focus();
    },
    toggleSearch() {
      const v = view.current!;
      if (searchPanelOpen(v.state)) closeSearchPanel(v);
      else openSearchPanel(v);
    },
    undo: () => view.current && undo(view.current),
    redo: () => view.current && redo(view.current),
    focus: () => view.current?.focus(),
  }));

  return <div className="cm-host" ref={host} />;
});

function wrapIn(v: EditorView, p: string, s: string) {
  const { from, to } = v.state.selection.main;
  const sel = v.state.sliceDoc(from, to);
  if (sel.startsWith(p) && sel.endsWith(s) && sel.length >= p.length + s.length) {
    v.dispatch({ changes: { from, to, insert: sel.slice(p.length, sel.length - s.length) } });
  } else {
    v.dispatch({ changes: { from, to, insert: `${p}${sel}${s}` }, selection: { anchor: from + p.length, head: to + p.length } });
  }
  v.focus();
}
