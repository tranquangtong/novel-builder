# The Last Miracle — Xưởng viết riêng tư

Trang web để viết và quản lý tiểu thuyết dài kỳ, chạy trên **GitHub Pages** (giống gymbro-web). Bản thảo nằm trong một **repo GitHub private riêng**. Claude (Claude Code) làm agent trên repo đó: sửa trên nhánh riêng và mở pull request. Bạn đọc, so sánh và quyết định nhập ngay trên trang.

- Trang: `https://tranquangtong.github.io/novel-builder/` (sau khi bật Pages, xem bên dưới)
- Repo này (`novel-builder`, public) chỉ chứa **mã của trang**, không chứa bản thảo.
- Không có máy chủ: trình duyệt gọi thẳng `api.github.com` bằng token của bạn.

## Bật lần đầu (làm một lần)

1. **Bật GitHub Pages cho repo này:** Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
2. **Tạo repo bản thảo private**, ví dụ `the-last-miracle-manuscript`, tick "Add a README".
3. (Tùy chọn) Settings → Secrets and variables → Actions → **Variables** → thêm `MANUSCRIPT_REPO` = `tranquangtong/the-last-miracle-manuscript`. Trang Kết nối sẽ điền sẵn tên repo này.
4. Mỗi lần có push lên nhánh mặc định, workflow `.github/workflows/pages.yml` chạy lint, typecheck, unit test, build và E2E, rồi mới deploy. Theo dõi ở tab **Actions**.
5. Mở trang → **Kết nối GitHub** → bấm link tạo **fine-grained token** (đã điền sẵn quyền):
   - Repository access: **Only select repositories** → chọn **đúng repo bản thảo**.
   - Quyền: **Contents: Read and write**, **Pull requests: Read and write**.
   - Dán token vào trang và bấm **Kết nối & kiểm tra**. Nếu repo còn trống thì bấm **Khởi tạo cấu trúc**.
6. Chuyển bản thảo từ Google Docs: *Tệp → Tải xuống → .txt hoặc .md*, rồi mở trang **Nhập & xuất** để xem trước và nhập.

Muốn thử trước khi có repo thật: trên trang Kết nối, bấm **Thử với dữ liệu demo**. Chế độ này tạo 200 chương DỮ LIỆU DEMO chỉ trong trình duyệt của bạn.

## Cách làm việc với Claude

- **Sửa bản thảo:** mở phiên Claude Code có gắn repo bản thảo, rồi giao việc, ví dụ "kiểm tra continuity Ch 10–11 với canon Kiếm Tro". Bạn có thể dán **Gói tài liệu** tạo từ trang. Claude đọc `AGENTS.md`, làm trên nhánh riêng, mở PR. Bạn mở trang → **Đề xuất chỉnh sửa** → xem trước/sau → **Chấp nhận**, **Yêu cầu sửa** hoặc **Đóng**.
- **Sửa chính trang web:** giao việc trong phiên Claude Code gắn repo `novel-builder`. Claude sửa mã, chạy test, push; GitHub Actions tự build và deploy. Bạn không cần chạy gì trên máy.

## Bảo mật: đọc kỹ

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

### Kiến trúc

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

- **Chưa kiểm chứng với GitHub thật.** Đã test với GitHub API giả mô phỏng theo đặc tả chính thức; cần bạn tạo repo và token để chạy thử thật (danh sách ở `docs/VERIFICATION.md`).
- Đăng nhập dùng token dán tay, không có nút "Đăng nhập với GitHub", vì luồng OAuth của GitHub cần máy chủ: bước đổi mã không hỗ trợ CORS. Token hết hạn thì tạo token mới và dán lại.
- Chỉ chấp nhận được **toàn bộ** đề xuất. Chưa có gộp 3 chiều trong editor: khi xung đột thì so sánh rồi chọn bản giữ lại.
- Nếu Claude mở PR bằng chính tài khoản của token, nút "approval chính thức trên GitHub" không dùng được (GitHub cấm tự approve). "Chấp nhận" (merge) vẫn hoạt động.
- Chế độ demo lưu trong trình duyệt; mỗi trình duyệt có kho demo riêng.
- Chưa có: nhập Google Docs từ URL, xuất DOCX/PDF, cộng tác thời gian thực.
