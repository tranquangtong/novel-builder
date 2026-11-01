# Kết quả kiểm chứng

Phiên bản: trang tĩnh trên GitHub Pages (Next.js 16.4.2 static export, React 19.2.9). Ngày 31/10/2026, Node 22, Chromium (Playwright 1.63).

## Đã chạy thật

| Kiểm tra | Kết quả |
|---|---|
| `npm run lint`, `npm run typecheck` | sạch |
| `npm test` (Vitest) | **25/25** qua |
| `npm run build` với `NEXT_PUBLIC_BASE_PATH=/novel-builder` | thành công, 11 trang tĩnh trong `out/` |
| `npm run test:e2e` (Playwright, phục vụ `out/` giống GitHub Pages) | **23/23** qua, chạy 2 lần liên tiếp |
| Quét `out/` tìm token | chỉ có placeholder `github_pat_…` trong giao diện, không có secret |

Workflow `.github/workflows/pages.yml` chạy lại toàn bộ các bước trên trong GitHub Actions trước khi deploy.

### E2E chế độ GitHub (trang tĩnh ↔ GitHub API giả qua `page.route`)

`tests/e2e/github-mode.spec.ts`:
- Kết nối bằng token: các bước kiểm tra đều ✓; không tick "Ghi nhớ" thì token **không** nằm trong localStorage.
- Danh sách **200 chương** chỉ đọc ≤ 6 blob (project, chỉ mục, 4 Act). Mở 3 chương thì đọc đúng 3 blob chương mới.
- **Mọi** request tới API mang đúng token. **Không** có request nào ra host khác ngoài `api.github.com`.
- Token sai: không kết nối và không lưu token. Repo public: cảnh báo "ĐANG PUBLIC".
- Lưu tiếng Việt: lần lưu bị lỗi 502 thì báo lỗi, không báo thành công, nháp còn sau reload. Lưu lại thì thành công, commit có nội dung đúng, đúng một lần `PATCH git/refs`.
- Agent sửa cùng chương trực tiếp trên GitHub: hiện cảnh báo; lưu bị từ chối; GitHub không bị ghi đè.
- Vào thẳng URL con dưới `/novel-builder/` hoạt động.

### E2E chế độ demo (kho mini-git trong IndexedDB, mỗi test một kho riêng)

`tests/e2e/flows.spec.ts`:
- Chưa kết nối thì chỉ vào được trang Kết nối, không có request ra ngoài. CSP chặn `fetch("https://example.com")`.
- Gõ tiếng Việt, reload, khôi phục nháp; đếm chữ cập nhật ngay; lưu phiên bản; đổi tên/chuyển Act giữ ID; chế độ đọc; tìm trong chương.
- Thay đổi từ bên ngoài, nháp dựa trên bản cũ, hai tab cùng sửa, agent và tác giả cùng sửa một chương: không ghi đè âm thầm.
- Review: diff, bình luận, chấp nhận (merge). Đề xuất đổi sau khi mở review thì không nhập.
- Phục hồi Ch10–11 về bản cũ: Ch8–9 và canon giữ nguyên từng byte, lịch sử chỉ thêm 1 phiên bản. Phục hồi từ panel có xem trước.
- Nhập văn bản giữ nguyên văn, có cảnh báo; xuất 1 chương và toàn bộ (200 chương); gói tài liệu đánh dấu tóm tắt cũ; sáng/tối.

### Unit/integration (`tests/unit/`)

- `GitHubStore` với GitHub API giả: chuỗi `POST git/trees → POST git/commits → PATCH git/refs (force=false)`; 422 không fast-forward thì thử lại; file đã đổi thì báo xung đột; merge 409/405; lỗi 502 khi commit thì nhánh không đổi; token sai thì 401.
- `ManuscriptService` trên kho demo, SHA-1 thuần JS khớp `node:crypto` và `git hash-object`, đếm chữ, frontmatter giữ nguyên byte, nhập văn bản, diff, path traversal, AGENTS.md đồng bộ với bản mẫu.

## Đã xác minh bằng tài liệu chính thức

docs.github.com bị chặn từ môi trường phát triển, nên tôi đọc nguồn tài liệu (repo `github/docs`, đặc tả `github/rest-api-description`):
- CORS: *"The REST API supports cross-origin resource sharing (CORS) for AJAX requests from any origin"* (`content/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests.md`).
- Link tạo fine-grained token điền sẵn tham số (`name`, `description`, `contents=write`, `pull_requests=write`, `expires_in`) (`managing-your-personal-access-tokens.md`).
- `PUT /pulls/{n}/merge` với `sha` (409 khi head khác, 405 khi không merge được); `PATCH /git/refs` với `force=false`; quyền từng endpoint; *"Pull request authors cannot approve their own pull requests"*.
- README `@octokit/auth-app`: các API OAuth tạo user token không hỗ trợ CORS. Đây là lý do dùng PAT thay vì nút "Đăng nhập với GitHub".
- `actions/deploy-pages` cần quyền `pages: write` và `id-token: write`. Phiên bản action đã kiểm tra bằng tag mới nhất: checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5.

## CHƯA kiểm chứng: cần bạn thao tác

1. **Bật Pages** (Settings → Pages → Source: GitHub Actions), rồi xem workflow deploy thành công.
2. Tạo repo bản thảo private và token, mở trang → Kết nối: các bước kiểm tra phải ✓.
3. **Khởi tạo cấu trúc** (hoặc nhờ Claude tạo cấu trúc trong repo), lưu một chương, rồi xem commit trên GitHub.
4. Nhờ Claude mở một PR sửa chương, rồi duyệt trên trang: chấp nhận, yêu cầu sửa, đóng.
5. Sửa cùng chương trên github.com rồi lưu từ trang: phải báo xung đột.

Khác biệt có thể gặp với GitHub thật: `mergeable` có thể là `null` vài giây (trang báo "đang kiểm tra"); giới hạn tốc độ khi xuất toàn bộ bản thảo (khoảng 200 lần đọc blob, chạy song song tối đa 8).

---

# Bổ sung: chế độ Cloudflare (R2 + D1 + Access) — 01/11/2026

| Kiểm tra | Kết quả |
|---|---|
| `npm run typecheck` (trang + Worker với `@cloudflare/workers-types`) | sạch |
| `npm test` | **34/34** (thêm 9 test Worker: D1 thật bằng SQLite, R2 giả lập) |
| `npx playwright test -c playwright.cloud.config.ts` | **4/4** trên **workerd** (`wrangler dev`, R2/D1 local) |
| `wrangler deploy --dry-run` | đóng gói được, 332 KB (gzip 80 KB) |

Đã kiểm tra:
- **Access JWT**: không có JWT, sai audience hoặc sai issuer → 401. Thiếu cấu hình → 500 (từ chối luôn, không mở cửa). Chế độ bỏ qua đăng nhập lúc phát triển chỉ hoạt động khi host là localhost.
- **Vai trò**:
  - Người chỉ đọc không lưu, không tạo bộ truyện, không tải ảnh lên được (403).
  - Agent không lưu thẳng bản chính, không nhập đề xuất, không sửa `index.json`, nhưng mở được đề xuất.
  - Service token lạ bị từ chối hẳn.
- **Ghi đồng thời**: hai phiên cùng đọc rồi cùng ghi thì phiên sau bị chặn, `withLock` chạy lại trên bản mới. Đã kiểm tra ngược: bỏ điều kiện `version` thì test trượt.
- **Chuyển bộ truyện**: nội dung khớp từng byte, chỉ mục được sinh lại, đường dẫn lạ hoặc thiếu `project.json` bị từ chối. E2E chuyển 200 chương từ GitHub API giả qua trình duyệt.
- **Ảnh**:
  - Tải lên, liệt kê và tải về đều được; trình duyệt giải mã PNG thật trong E2E.
  - Ảnh chèn vào chương hiển thị ở chế độ đọc.
  - Chặn SVG, ảnh hơn 15 MB, người chỉ đọc và path traversal. Xóa thì chuyển vào `trash/`.
- **CSRF**: request ghi có Origin lạ → 403.

Đã xác minh qua mã nguồn tài liệu Cloudflare (`cloudflare/cloudflare-docs`): header `Cf-Access-Jwt-Assertion` và JWKS `/cdn-cgi/access/certs`; claim `common_name` của service token; `ctx.access` **không** có khi Worker có Static Assets (nên Worker tự kiểm tra JWT); `run_worker_first`; R2 `list({include})`; D1 `batch` là transaction; giới hạn gói miễn phí của D1/R2; `keep_vars` và `--var`.

**CHƯA chạy thật**, cần bạn làm theo `docs/CLOUDFLARE_SETUP.md`. Những điểm có thể khác với bản local:
- Access ở cấp Worker có gửi header `Cf-Access-Jwt-Assertion` tới Worker hay không. Nếu không, API sẽ trả 401 "Chưa đăng nhập qua Cloudflare Access", báo tôi để chuyển sang ứng dụng Access theo hostname.
- Độ trễ thật giữa R2 và D1.
