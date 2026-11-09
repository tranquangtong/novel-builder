# Novel Builder — Xưởng viết riêng tư

Trang web để viết và quản lý **nhiều bộ tiểu thuyết dài kỳ**, mỗi chương có thể kèm ảnh (phác thảo, minh hoạ, tham khảo). Bạn cộng tác với agent qua đề xuất chỉnh sửa và tự quyết định nhập vào bản chính.

Hiện có hai cách chạy:

| | **Cloudflare (khuyến nghị)** | GitHub Pages (cách cũ) |
|---|---|---|
| Trang | Cloudflare Worker | `tranquangtong.github.io/novel-builder` |
| Bản thảo | R2 (chương, phiên bản, ảnh) + D1 (trạng thái nhỏ) | Repo GitHub private |
| Đăng nhập | Google (Firebase) | Dán fine-grained token |
| Nhiều bộ truyện | Có, tạo ngay trên trang | Mỗi bộ một repo |
| Ảnh theo chương | Có | Không |
| Agent | API của Worker + token agent `nbagent_…` | Pull request trên GitHub |

Thiết lập Cloudflare: **[docs/CLOUDFLARE_SETUP.md](docs/CLOUDFLARE_SETUP.md)**. Đăng nhập Google (Firebase), người đọc và chế độ đọc: **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**. Mã nguồn vẫn ở repo này; GitHub Actions kiểm tra rồi deploy lên cả hai nơi.

## GitHub Pages: bật lần đầu (cách cũ)

1. **Bật GitHub Pages cho repo này:** Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
2. **Tạo repo bản thảo private**, ví dụ `ten-truyen-manuscript`, tick "Add a README".
3. (Tùy chọn) Settings → Secrets and variables → Actions → **Variables** → thêm `MANUSCRIPT_REPO` = `owner/ten-truyen-manuscript`. Trang Kết nối sẽ điền sẵn tên repo này.
4. Mỗi lần có push lên nhánh mặc định, workflow `.github/workflows/pages.yml` chạy lint, typecheck, unit test, build và E2E, rồi mới deploy. Theo dõi ở tab **Actions**.
5. Mở trang → **Kết nối GitHub** → bấm link tạo **fine-grained token** (đã điền sẵn quyền):
   - Repository access: **Only select repositories** → chọn **đúng repo bản thảo**.
   - Quyền: **Contents: Read and write**, **Pull requests: Read and write**.
   - Dán token vào trang và bấm **Kết nối & kiểm tra**. Nếu repo còn trống thì bấm **Khởi tạo cấu trúc**.
6. Chuyển bản thảo từ Google Docs: *Tệp → Tải xuống → .txt hoặc .md*, rồi mở trang **Nhập & xuất** để xem trước và nhập.

Muốn thử trước khi có repo thật: trên trang Kết nối, bấm **Thử với dữ liệu demo**. Chế độ này tạo 200 chương DỮ LIỆU DEMO chỉ trong trình duyệt của bạn.

## Cách làm việc với Claude

Bản thảo "The Last Miracle" nằm trên Cloudflare; **không còn repo bản thảo trên GitHub**. Mọi phiên Claude Code chỉ cần gắn repo `novel-builder`.

- **Sửa bản thảo:** mở phiên Claude Code gắn repo `novel-builder`, rồi giao việc, ví dụ "kiểm tra continuity Ch 10–11 với canon Kiếm Tro". Claude đọc và gửi đề xuất qua API của trang (`.claude/novel/nb.py`, quy tắc trong `templates/manuscript/AGENTS.md`), bằng token agent `nbagent_…` lưu trong môi trường. Mọi lần sửa nội dung truyện cũng theo quy trình 2 vòng QC này (xem `CLAUDE.md`). Bạn mở trang → **Đề xuất chỉnh sửa** → xem trước/sau → **Chấp nhận**, **Yêu cầu sửa** hoặc **Đóng**.
- **Viết chương mới bằng hai agent:** trong phiên Claude Code gắn repo `novel-builder`, gõ `/drafting 41-45` (kèm ghi chú nếu muốn). Agent `novel-writer` đọc outline và các chương trước rồi viết; agent `novel-qc` soát chính tả, canon, outline, xưng hô và số liệu; quy trình đúng 2 vòng: QC vòng 1 → sửa → QC vòng 2 → sửa → báo cáo, rồi Claude mở **một** đề xuất trên trang. Cấu hình ở `.claude/agents/`, `.claude/commands/drafting.md`; bảng kiểm canon ở `.claude/novel/canon-checklist.md`; script gọi API ở `.claude/novel/nb.py`. Cần token agent `nbagent_…` trong môi trường (xem `docs/FIREBASE_SETUP.md`).
- **Sửa chính trang web:** giao việc trong phiên Claude Code gắn repo `novel-builder`. Claude sửa mã, chạy test, push; GitHub Actions tự build và deploy. Bạn không cần chạy gì trên máy.

## Bảo mật: đọc kỹ

### Cloudflare

- Đăng nhập bằng Google qua Firebase. Worker tự kiểm tra ID token của Firebase ở mọi request API.
- Email nằm trong `EDITOR_EMAILS` → **biên tập**. Mọi tài khoản Google khác → **người đọc**: chỉ có chế độ đọc (mục lục, chương truyện), máy chủ chặn mọi API khác (403).
- Agent dùng token `nbagent_…`. Token phải khớp một mục trong secret `AGENT_TOKENS` của Worker (đặt từ secret `NB_AGENT_TOKENS` trên GitHub). Agent chỉ đọc, mở đề xuất và bình luận; không lưu thẳng vào bản chính, không nhập đề xuất, không xoá ảnh. Token lưu trong môi trường của phiên Claude Code, không bao giờ ghi vào file hay dán vào chat. Nghi lộ token thì đổi `NB_AGENT_TOKENS` rồi chạy lại workflow.

### GitHub Pages (cách cũ)

- Trang Pages là **public**, nhưng chỉ chứa mã. Bản thảo chỉ được tải khi có token đọc được repo private, và GitHub tự kiểm tra quyền của token.
- Token **chỉ nằm trong trình duyệt của bạn**: trong tab hiện tại, hoặc trên thiết bị nếu tick "Ghi nhớ". Token chỉ được gửi tới `api.github.com`; Content-Security-Policy của trang chặn kết nối tới mọi địa chỉ khác.
- Chỉ tick "Ghi nhớ trên thiết bị này" trên máy riêng. Mất máy hoặc nghi lộ token thì thu hồi ở GitHub → Settings → Developer settings → Personal access tokens.
- Token chỉ chọn **một repo bản thảo** với hai quyền ở trên. Đừng dùng token classic hay token có quyền trên mọi repo.

## Cho người phát triển

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Xuất tĩnh vào `out/` (đặt `NEXT_PUBLIC_BASE_PATH=/novel-builder` để giống Pages) |
| `npm start` | Phục vụ `out/` như GitHub Pages (`scripts/serve-static.mjs`) |
| `npm run lint` / `npm run typecheck` / `npm test` | ESLint / TypeScript / Vitest |
| `npm run test:e2e` | Playwright trên bản xuất tĩnh: chế độ demo và chế độ GitHub với API giả |
| `npx playwright test -c playwright.cloud.config.ts` | Playwright trên Worker thật (workerd, `wrangler dev`) với R2/D1 local. Cần build trước với `NEXT_PUBLIC_BASE_PATH=` |
| `npx wrangler dev` | Chạy Worker local; tạo `.dev.vars` với `DEV_AUTH_EMAIL=...` và `EDITOR_EMAILS=...` (chỉ có hiệu lực với localhost) |

### Kiến trúc (Cloudflare)

```
Trình duyệt ──(Google qua Firebase: ID token)──► Worker novel-builder
Agent ───────(Authorization: Bearer nbagent_…)──┘
                                                   ├─ trang tĩnh (out/)
                                                   └─ /api/novels/<id>/…  ── cùng mã nghiệp vụ với chế độ demo/GitHub
                                                        ├─ R2: novels/<id>/objects/…  (nội dung + commit, bất biến theo sha)
                                                        ├─ R2: novels/<id>/assets/<chương>/…  (ảnh; xoá = chuyển vào trash/)
                                                        └─ D1: novels, repo_state (nhánh + đề xuất; ghi kiểu compare-and-swap)
```

- Vai trò: email trong `EDITOR_EMAILS` → **biên tập**; tài khoản Google khác → **người đọc** (chỉ chế độ đọc); token trong `AGENT_TOKENS` → **agent** (chỉ đọc + mở đề xuất + bình luận). Worker vẫn nhận phiên Cloudflare Access và service token trong `AGENT_CLIENT_IDS` nếu bạn bật lại Access, nhưng hiện Access đã tắt.
- Lịch sử, phục hồi, đề xuất, review, gói tài liệu chạy y như trước: Worker dùng lại đúng lõi `ManuscriptService` + mini-git, chỉ đổi chỗ lưu.

### Kiến trúc (GitHub Pages, cách cũ)

```
GitHub Pages (tĩnh, public)            Repo bản thảo (private)
  Next.js static export                   content/… , AGENTS.md
  ├─ Nháp: IndexedDB (thiết bị)              ▲
  ├─ Token: sessionStorage/localStorage      │ REST API (CORS), token của tác giả
  └─ ManuscriptService ──► GitHubStore ───────┘
                       └─► DemoStore (mini-git trong IndexedDB, chỉ để thử)
```

- **Một lần lưu = một commit nguyên tử** (Git Data API: tree → commit → cập nhật ref với `force: false`). Chương, metadata và chỉ mục được ghi cùng nhau.
- **Phát hiện xung đột theo blob sha của từng file**: nếu chương đã đổi so với bản bạn dựa vào thì từ chối lưu và giữ nháp; nếu chỉ file khác đổi thì tự thử lại.
- Danh sách 200+ chương chỉ đọc `content/index.json`; mở chương nào thì chỉ tải chương đó.

Chi tiết: [docs/SCHEMA_AND_FLOWS.md](docs/SCHEMA_AND_FLOWS.md) · Bảo mật và triển khai: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · Kiểm chứng: [docs/VERIFICATION.md](docs/VERIFICATION.md) · Quy tắc agent: [templates/manuscript/AGENTS.md](templates/manuscript/AGENTS.md)

## Hạn chế còn lại

- Test E2E của Worker chạy trên workerd (`wrangler dev`) với R2/D1 local, không chạy trên trang thật.
- Chuyển từ GitHub sang Cloudflare chỉ mang theo **bản chính hiện tại**, không mang lịch sử commit cũ. Xoá repo GitHub cũ là mất lịch sử đó.
- API không cho đọc `AGENTS.md` trên trang (`/file` chỉ nhận đường dẫn `content/…`). Agent đọc bản trong repo này: `templates/manuscript/AGENTS.md`.
- Ảnh chưa có phiên bản: tải ảnh mới là thêm ảnh mới; xóa thì ảnh chuyển vào thùng rác trên R2, lấy lại thủ công.
- (GitHub Pages) Đăng nhập dùng token dán tay, không có nút "Đăng nhập với GitHub", vì luồng OAuth của GitHub cần máy chủ: bước đổi mã không hỗ trợ CORS. Token hết hạn thì tạo token mới và dán lại.
- Chỉ chấp nhận được **toàn bộ** đề xuất. Chưa có gộp 3 chiều trong editor: khi xung đột thì so sánh rồi chọn bản giữ lại.
- (GitHub Pages) Nếu Claude mở PR bằng chính tài khoản của token, nút "approval chính thức trên GitHub" không dùng được (GitHub cấm tự approve). "Chấp nhận" (merge) vẫn hoạt động.
- Chế độ demo lưu trong trình duyệt; mỗi trình duyệt có kho demo riêng.
- Chưa có: nhập Google Docs từ URL, xuất DOCX/PDF, cộng tác thời gian thực.
