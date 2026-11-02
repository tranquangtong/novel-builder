"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, Compartment, RangeSetBuilder, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType, dropCursor, keymap, placeholder as cmPlaceholder, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { closeSearchPanel, highlightSelectionMatches, openSearchPanel, search, searchKeymap, searchPanelOpen } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { assetUrl } from "./Markdown";

export interface EditorHandle {
  setValue(text: string): void;
  getValue(): string;
  wrap(prefix: string, suffix?: string): void;
  linePrefix(prefix: string): void;
  insertBlock(text: string): void;
  /** Chèn ảnh (một khối riêng) ngay sau đoạn đang đặt con trỏ; trả về vị trí đã chèn. */
  insertImage(markdown: string): void;
  /** Đoạn mà ảnh sẽ được chèn vào sau (để hiện gợi ý cho người dùng). */
  insertTarget(): { atStart: boolean; snippet: string };
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
          imagePreviews,
          dropCursor(),
          dropImages,
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
    insertImage(md) {
      const v = view.current!;
      const { pos, insert } = imageInsertion(v.state.doc, v.state.selection.main.head, md);
      const start = pos + insert.indexOf(md);
      v.dispatch({ changes: { from: pos, insert }, selection: { anchor: start, head: start + md.length }, scrollIntoView: true });
      v.focus();
    },
    insertTarget() {
      const v = view.current!;
      const doc = v.state.doc;
      const head = v.state.selection.main.head;
      let line = doc.lineAt(head);
      // dòng trống: lấy đoạn ngay phía trên
      while (!line.text.trim() && line.number > 1) line = doc.line(line.number - 1);
      const t = line.text.trim();
      return { atStart: !t, snippet: t.length > 80 ? `${t.slice(0, 80)}…` : t };
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

/**
 * Vị trí chèn ảnh: con trỏ ở dòng trống → chèn ngay tại đó; con trỏ ở giữa một đoạn →
 * chèn SAU đoạn đó (không cắt đôi câu văn). Ảnh luôn đứng thành khối riêng, cách dòng trống.
 */
export function imageInsertion(doc: Text, head: number, md: string, place: "after" | "nearest" = "after"): { pos: number; insert: string } {
  const line = doc.lineAt(head);
  // thả chuột: gần đầu đoạn hơn → đặt TRƯỚC đoạn
  if (place === "nearest" && line.text.trim() && head - line.from < (line.to - line.from) / 2) {
    const before = line.number > 1 && doc.line(line.number - 1).text.trim() ? "\n\n" : "";
    return { pos: line.from, insert: `${before}${md}\n\n` };
  }
  if (!line.text.trim()) {
    const before = line.number > 1 && doc.line(line.number - 1).text.trim() ? "\n" : "";
    const after = line.number < doc.lines && doc.line(line.number + 1).text.trim() ? "\n" : "";
    return { pos: line.from, insert: `${before}${md}${after}` };
  }
  const after = line.number < doc.lines ? (doc.line(line.number + 1).text.trim() ? "\n\n" : "") : "\n";
  return { pos: line.to, insert: `\n\n${md}${after}` };
}

/** Dòng chỉ chứa một ảnh: ![chú thích](asset:khoá) */
const IMG_ONLY_LINE = /^\s*!\[([^\]]*)\]\(asset:([^)\s]+)\)\s*$/;
/** Kéo một ảnh ĐÃ nằm trong bài để dời chỗ: mang theo vị trí dòng gốc. */
const IMAGE_MOVE_TYPE = "application/x-novel-image-move";

/** Khoảng cần xoá khi bỏ dòng ảnh: chính dòng đó và một dòng trống liền sau (tránh dồn dòng trống). */
function imageLineRange(doc: Text, at: number) {
  const line = doc.lineAt(at);
  let to = line.number < doc.lines ? line.to + 1 : line.to;
  if (line.number + 1 <= doc.lines) {
    const next = doc.line(line.number + 1);
    if (!next.text.trim()) to = next.number < doc.lines ? next.to + 1 : next.to;
  }
  return { from: line.from, to };
}

/**
 * Trong chế độ Viết, dòng ![…](asset:…) được THAY bằng chính bức ảnh (không hiện chữ/URL).
 * Dòng đó vẫn nằm trong file chương — nó là thứ giữ vị trí ảnh. Kéo ảnh để dời, bấm × để bỏ.
 */
class ImageWidget extends WidgetType {
  constructor(readonly key: string, readonly alt: string) {
    super();
  }
  eq(o: ImageWidget) {
    return o.key === this.key && o.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("figure");
    wrap.className = "cm-img-preview";
    wrap.draggable = !view.state.readOnly;
    wrap.title = "Kéo để dời ảnh sang chỗ khác";
    const img = document.createElement("img");
    img.src = assetUrl(this.key);
    img.alt = this.alt;
    img.loading = "lazy";
    img.draggable = false;
    wrap.appendChild(img);
    if (this.alt) {
      const cap = document.createElement("figcaption");
      cap.textContent = this.alt;
      wrap.appendChild(cap);
    }
    if (!view.state.readOnly) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cm-img-remove";
      del.textContent = "×";
      del.title = "Bỏ ảnh khỏi chương (ảnh vẫn còn trong thư viện ảnh)";
      del.setAttribute("aria-label", "Bỏ ảnh khỏi chương");
      del.addEventListener("mousedown", (e) => e.preventDefault());
      del.addEventListener("click", (e) => {
        e.preventDefault();
        const pos = view.posAtDOM(wrap);
        view.dispatch({ changes: imageLineRange(view.state.doc, pos), userEvent: "delete" });
        view.focus();
      });
      wrap.appendChild(del);
    }
    wrap.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      const line = view.state.doc.lineAt(view.posAtDOM(wrap));
      e.dataTransfer.setData(IMAGE_DRAG_TYPE, line.text.trim());
      e.dataTransfer.setData(IMAGE_MOVE_TYPE, String(line.from));
      e.dataTransfer.effectAllowed = "move";
    });
    return wrap;
  }
  ignoreEvent() {
    // để nút × và kéo-thả của ảnh tự xử lý, editor không can thiệp
    return true;
  }
}

function buildPreviews(doc: Text): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const m = IMG_ONLY_LINE.exec(line.text);
    if (m) b.add(line.from, line.to, Decoration.replace({ widget: new ImageWidget(m[2], m[1]), block: true }));
  }
  return b.finish();
}

const imagePreviews = StateField.define<DecorationSet>({
  create: (st) => buildPreviews(st.doc),
  update: (deco, tr) => (tr.docChanged ? buildPreviews(tr.state.doc) : deco),
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((v) => v.state.field(f))],
});

/** Kiểu dữ liệu kéo-thả riêng cho ảnh từ thư viện ảnh của chương. */
export const IMAGE_DRAG_TYPE = "application/x-novel-image";

/**
 * Thả ảnh từ thư viện vào bài: đặt ảnh thành khối riêng tại đúng chỗ thả
 * (thả giữa một đoạn thì ảnh nằm sau đoạn đó, không cắt đôi câu).
 */
const dropImages = EditorView.domEventHandlers({
  dragover(e) {
    if (e.dataTransfer?.types.includes(IMAGE_DRAG_TYPE)) {
      e.preventDefault();
      // dời ảnh trong bài: "move"; ảnh từ thư viện: "copy" (phải khớp effectAllowed, nếu không trình duyệt chặn thả)
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(IMAGE_MOVE_TYPE) ? "move" : "copy";
    }
    return false;
  },
  drop(e, view) {
    const md = e.dataTransfer?.getData(IMAGE_DRAG_TYPE);
    if (!md) return false;
    e.preventDefault();
    if (view.state.readOnly) return true;
    const doc = view.state.doc;
    const at = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? doc.length;
    const { pos, insert } = imageInsertion(doc, at, md, "nearest");
    // dời ảnh đã có trong bài: bỏ dòng cũ và chèn chỗ mới trong cùng một thao tác (hoàn tác được)
    const movedFrom = e.dataTransfer?.getData(IMAGE_MOVE_TYPE);
    const old = movedFrom ? imageLineRange(doc, Math.min(Number(movedFrom), doc.length)) : null;
    if (old && pos >= old.from && pos <= old.to) return true; // thả lại đúng chỗ cũ
    const changes = old ? [{ from: old.from, to: old.to, insert: "" }, { from: pos, insert }] : [{ from: pos, insert }];
    const tr = view.state.update({ changes, userEvent: old ? "move.drop" : "input.drop" });
    const start = tr.changes.mapPos(pos, 1) - insert.length + insert.indexOf(md);
    view.dispatch(tr, { selection: { anchor: start }, scrollIntoView: true });
    view.focus();
    return true;
  },
});
