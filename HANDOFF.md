# Handoff — Thư viện ảnh (gallery)

Ngày: 2026-11-23 · Chuyển từ máy Windows sang MacBook · Nhánh: `claude/jolly-wozniak-v41zu7`

## Yêu cầu

Thêm cho web Novel Builder một mục menu để xem gallery các ảnh đã tạo.

## Đã làm (đã merge vào nhánh, commit `f3757ca`)

- **agy** (gemini-4-neon-high) viết phần UI, commit `741496c`.
- **codex** (gpt-6.2-sol/medium) review, sửa lỗi và chạy test, commit `c6b366b`.

Tính năng:

- Mục menu **"Thư viện ảnh"** (`/gallery`). Chỉ có trong chế độ Cloudflare (`CLOUD_NAV` trong `src/components/Shell.tsx`).
- Trang `src/app/(studio)/gallery/page.tsx`:
  - Lưới ảnh thu nhỏ của mọi ảnh trong bộ truyện, mới nhất trước. Dữ liệu lấy từ `GET /api/novels/:id/assets` (không truyền `?chapter=`).
  - Lọc theo loại ảnh và theo chương (có đếm số ảnh).
  - Lightbox có nút "Mở chương" và "Mở ảnh gốc", chuyển ảnh bằng phím mũi tên.
  - Nút xoá chỉ hiện khi đã xác nhận vai trò biên tập.
  - Ngoài chế độ Cloudflare thì hiện thông báo.
- Hàm thuần `src/lib/domain/gallery.ts`. Phần dùng chung tách ra từ `src/components/ChapterImages.tsx`.
- `src/components/Modal.tsx` thêm `testId`, tiêu đề dialog cho a11y, giữ focus bên trong dialog và trả focus khi đóng.
- Test mới:
  - `tests/unit/gallery.test.ts`;
  - case "thư viện ảnh" trong `tests/e2e-cloud/cloud.spec.ts`;
  - case "thư viện ảnh chỉ khả dụng trong chế độ Cloudflare" trong `tests/e2e/flows.spec.ts`.

## Kết quả test

| Lệnh | Ở worktree của Codex | Trên máy Windows (lead chạy lại) |
|---|---|---|
| `npm run check` | ✅ 58/58 unit, build OK | ✅ 58/58 unit, build OK |
| `npx playwright test -c playwright.cloud.config.ts` (cần build với `NEXT_PUBLIC_BASE_PATH=`) | ✅ 8/8 | ⚠️ 6/8. Test gallery **đạt**; 2 test hỏng là `cloud.spec.ts:258` (lỗi đăng nhập) và `:270` (chế độ đọc) |
| `npm run test:e2e` (cần build với `NEXT_PUBLIC_BASE_PATH=/novel-builder`) | ✅ 29/29 | ⏸ chưa chạy xong (đã dừng giữa chừng) |

Hai test cloud hỏng (`:258`, `:270`) **cũng hỏng trên commit gốc `d49e5e9`**, trước khi thêm gallery. Lệnh build cũ thiếu `NEXT_PUBLIC_TARGET=cloudflare`, cờ bật chế độ đọc và hiển thị lỗi đăng nhập Cloudflare.

## Việc còn lại (trên MacBook)

1. `git pull`, rồi `npm ci`, rồi `npx playwright install chromium`.
2. Chạy `npm run check`.
3. Chạy E2E cloud: `NEXT_PUBLIC_TARGET=cloudflare NEXT_PUBLIC_BASE_PATH= npm run build && npx playwright test -c playwright.cloud.config.ts`. Kỳ vọng 8/8. Xem [README](README.md#cho-người-phát-triển) nếu dùng PowerShell.
4. Chạy E2E thường: `NEXT_PUBLIC_BASE_PATH=/novel-builder npm run build && npm run test:e2e`. Kỳ vọng 29/29.
5. Nếu cả hai đạt, test tay trên `npm run dev` hoặc `npx wrangler dev`: mở menu "Thư viện ảnh", lọc ảnh, mở lightbox, kiểm tra người đọc không thấy nút xoá.
6. Có thể nhờ Codex review chéo (read-only) bản diff `d49e5e9..f3757ca` trước khi deploy.
7. Dọn dẹp:
   - `~/.ai-bridge/bin/ai-bridge clean-merged` (trên máy Windows còn worktree `agy-gallery-ui` và `codex-gallery-verify` dưới `/d/ai-bridge/worktrees/`);
   - Codex để lại các thư mục bị gitignore trong worktree của nó: `node_modules/.gallery-npm-cache`, `.wrangler/e2e`, `.wrangler/gallery-config`, `.wrangler/tmp`.
8. Xoá file `HANDOFF.md` này khi xong.

## Lưu ý

- **Cảnh báo bảo mật Next.js 16.4.2.** Lệnh `next build` báo phiên bản có lỗ hổng đã biết. Build dừng một lần để hiện khuyến nghị, chạy lại thì qua. Nó gợi ý `next upgrade --agent=security …`. Việc nâng phiên bản nằm ngoài task này và cần tác giả quyết. Theo `collab.md`, không tự đổi deps/lockfile.
