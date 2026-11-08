#!/usr/bin/env python3
"""Công cụ dòng lệnh cho agent làm việc với bản thảo trên Novel Builder (Cloudflare).

Xác thực: header `Authorization: Bearer nbagent_…`.
  - Trong phiên Claude Code trên cloud: proxy tự gắn token (network secret của môi trường), không cần làm gì.
  - Chạy ở nơi khác: đặt biến môi trường NB_AGENT_TOKEN. Không bao giờ ghi token vào file hay chat.

Biến môi trường tùy chọn:
  NB_BASE   (mặc định https://novel-builder.tongquangtran.workers.dev)
  NB_NOVEL  (mặc định nv_bt8y37enbg — The Last Miracle)

Lệnh:
  project                         In headSha, danh sách Act và chương (theo thứ tự).
  get <chapter_id|content/path>   In nội dung đầy đủ (cả frontmatter) ra stdout.
  pull <dir> [--from N] [--to M]  Lưu chương có số thứ tự N..M (ngoài Act 0) + toàn bộ ghi chú Act 0 vào <dir>.
  wc <file>...                    Đếm chữ đúng quy tắc của ứng dụng (bỏ frontmatter, ảnh, comment HTML).
  newid                           Sinh một id chương mới (ch_ + 10 ký tự base32 Crockford thường).
  proposals                       Liệt kê đề xuất đang mở.
  propose --title T --body-file F [--dry-run] <file>...
                                  Mở đề xuất. Mỗi file phải có frontmatter `id:`; chương → content/chapters/<id>.md.
                                  Muốn sửa file khác (Act, ghi chú…), dùng dạng `content/acts/act_x.md=duong/dan/file.md`
                                  (hoặc `AGENTS.md=duong/dan/file.md`).
"""
import json
import os
import re
import secrets
import subprocess
import sys

BASE = os.environ.get("NB_BASE", "https://novel-builder.tongquangtran.workers.dev").rstrip("/")
NOVEL = os.environ.get("NB_NOVEL", "nv_bt8y37enbg")
API = f"{BASE}/api/novels/{NOVEL}"
NOTES_ACT_KIND = "notes"


def _curl(url, method="GET", data=None):
    cmd = ["curl", "-sS", "-w", "\n%{http_code}", "-X", method, url]
    tok = os.environ.get("NB_AGENT_TOKEN")
    if tok:
        cmd += ["-H", f"Authorization: Bearer {tok}"]
    if data is not None:
        cmd += ["-H", "Content-Type: application/json", "--data-binary", "@-"]
    r = subprocess.run(cmd, input=(json.dumps(data, ensure_ascii=False).encode() if data is not None else None), capture_output=True)
    out = r.stdout.decode("utf-8", "replace")
    body, _, code = out.rpartition("\n")
    if r.returncode != 0 or not code.startswith("2"):
        sys.exit(f"Lỗi {code or r.returncode} khi gọi {url}: {body[:300] or r.stderr.decode()[:300]}")
    return json.loads(body)


def project():
    return _curl(f"{API}/project")


def story_chapters(p):
    notes = {a["id"] for a in p["acts"] if a.get("kind") == NOTES_ACT_KIND}
    acts = {a["id"]: a for a in p["acts"]}
    chs = [c for c in p["chapters"] if c["act_id"] not in notes]
    chs.sort(key=lambda c: (acts.get(c["act_id"], {}).get("order", 99), c["order"]))
    return chs, [c for c in p["chapters"] if c["act_id"] in notes], acts


def get_file(path):
    return _curl(f"{API}/file?path={path}")["content"]


def count_words(text):
    if text.startswith("---"):
        parts = text.split("---", 2)
        text = parts[2] if len(parts) == 3 else text
    text = re.sub(r"<!--[\s\S]*?-->", " ", text)
    text = re.sub(r"!\[[^\]\n]*\]\([^)\n]*\)", " ", text)
    return sum(1 for t in text.split() if re.search(r"[^\W_]", t))


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    cmd, args = argv[0], argv[1:]
    if cmd == "project":
        p = project()
        chs, notes, acts = story_chapters(p)
        print("headSha", p["headSha"])
        for a in sorted(p["acts"], key=lambda a: a["order"]):
            print(f"ACT {a['order']} {a['id']} {a['title']} | {a.get('description','')}")
        for c in notes:
            print(f"NOTE {c['id']} {c['title']}")
        for i, c in enumerate(chs, 1):
            print(f"Ch{i:>3} order={c['order']:<4} {c['act_id']} {c['id']} {c.get('words','?'):>5}w {c['title']}")
    elif cmd == "get":
        ref = args[0]
        print(get_file(ref if ref.startswith("content/") else f"content/chapters/{ref}.md"), end="")
    elif cmd == "pull":
        out = args[0]
        lo = int(args[args.index("--from") + 1]) if "--from" in args else 1
        hi = int(args[args.index("--to") + 1]) if "--to" in args else 10**9
        os.makedirs(out, exist_ok=True)
        p = project()
        chs, notes, _ = story_chapters(p)
        for c in notes:
            open(os.path.join(out, f"note_{c['id']}.md"), "w", encoding="utf-8").write(get_file(c["path"]))
        for i, c in enumerate(chs, 1):
            if lo <= i <= hi:
                open(os.path.join(out, f"Ch{i:03d}_{c['id']}.md"), "w", encoding="utf-8").write(get_file(c["path"]))
        open(os.path.join(out, "HEAD"), "w").write(p["headSha"] + "\n")
        print(f"Đã lưu vào {out} (headSha {p['headSha']})")
    elif cmd == "wc":
        for f in args:
            print(f"{count_words(open(f, encoding='utf-8').read()):>6}  {f}")
    elif cmd == "newid":
        a = "0123456789abcdefghjkmnpqrstvwxyz"
        print("ch_" + "".join(a[b % 32] for b in secrets.token_bytes(10)))
    elif cmd == "proposals":
        for pr in _curl(f"{API}/proposals")["pulls"]:
            print(pr["number"], pr["state"], pr["title"])
    elif cmd == "propose":
        title = args[args.index("--title") + 1]
        body = open(args[args.index("--body-file") + 1], encoding="utf-8").read()
        dry = "--dry-run" in args
        skip = {args.index("--title"), args.index("--title") + 1, args.index("--body-file"), args.index("--body-file") + 1}
        files = [a for i, a in enumerate(args) if i not in skip and a != "--dry-run"]
        changes = {}
        for f in files:
            if "=" in f and (f.startswith("content/") or f.startswith("AGENTS.md=")):
                path, src = f.split("=", 1)
            else:
                src = f
                m = re.search(r"^id:\s*(ch_[0-9a-z_-]+)\s*$", open(src, encoding="utf-8").read(), re.M)
                if not m:
                    sys.exit(f"{src}: thiếu `id:` trong frontmatter")
                path = f"content/chapters/{m.group(1)}.md"
            text = open(src, encoding="utf-8").read()
            if "\\!" in text and path != "AGENTS.md":  # AGENTS.md nhắc tới chính ký tự này
                sys.exit(f"{src}: còn ký tự \\! (AGENTS.md mục 9)")
            changes[path] = text
        head = project()["headSha"]
        payload = {"title": title, "body": body, "baseCommit": head, "changes": changes}
        if dry:
            print(json.dumps({k: (v if k != "changes" else {p: f"{len(t)} ký tự" for p, t in v.items()}) for k, v in payload.items()}, ensure_ascii=False, indent=2))
            return
        print(json.dumps(_curl(f"{API}/agent/proposals", "POST", payload), ensure_ascii=False))
    else:
        sys.exit(f"Lệnh không rõ: {cmd}\n{__doc__}")


if __name__ == "__main__":
    main(sys.argv[1:])
