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

## Bổ sung 01/11/2026 (2): trang Bộ truyện, tự lưu nháp lên R2, ảnh theo chương, menu gọn

| Kiểm tra | Kết quả |
|---|---|
| `npm run lint`, `npm run typecheck` | sạch |
| `npm test` | **37/37** (thêm: nháp R2, đổi tên + thống kê, loại ảnh) |
| `npx playwright test` (bản tĩnh) | **25/25** |
| `npx playwright test -c playwright.cloud.config.ts` (workerd) | **5/5** |

E2E mới trên workerd:
- Chưa chọn bộ truyện thì vào trang **Bộ truyện**. `/settings` trên Cloudflare chuyển về trang này. Menu không còn "Nhập & xuất", "Gói tài liệu", "kết nối".
- Gõ trong chương → "Nháp đã tự lưu lên Cloudflare". Mở **trình duyệt mới** (không IndexedDB) vẫn thấy nháp. Lưu phiên bản thì nháp trên R2 bị xoá. Đổi tên bộ truyện cập nhật danh sách và tiêu đề.
- Ảnh loại Nhân vật / Cảnh quan, lọc theo loại, chèn vào chương, hiển thị khi đọc.
- Chuyển 200 chương từ GitHub (API giả) xong thì tự mở bộ vừa chuyển; thống kê "200 chương".

Lỗi tìm ra khi chạy test và đã sửa: đổi kết nối xoá cache truy vấn, làm trang Kết nối bị tháo ra/gắn lại và mất kết quả kiểm tra. Gate giờ ghi nhớ môi trường (Cloudflare hay trang tĩnh).

Đã kiểm tra trên mạng thật: `https://novel-builder.tongquangtran.workers.dev` trả 302 sang trang đăng nhập Cloudflare Access (`tqtong.cloudflareaccess.com`). Nghĩa là Worker đã deploy và Access đang bảo vệ.

## Bổ sung 02/11/2026: tên chương dài, bỏ giao diện tối, chèn ảnh ở bất kỳ đâu

| Kiểm tra | Kết quả |
|---|---|
| lint, typecheck | sạch |
| `npm test` | **45/45** (thêm 4 test cho quy tắc chèn ảnh; gồm cả test của Act 0) |
| E2E bản tĩnh | **26/26** (test "chuyển sáng/tối" đổi thành "chỉ có giao diện sáng kể cả khi máy đặt chế độ tối") |
| E2E Cloudflare (workerd) | **6/6** |

E2E ảnh:
- Bấm vào đoạn 1 → 🖼 Ảnh → hộp chọn ghi "sau đoạn: Đoạn một…" → ảnh nằm giữa đoạn 1 và đoạn 2.
- Kéo ảnh từ panel thả vào đầu đoạn 2 → ảnh nằm trước đoạn 2.
- Thứ tự khi đọc đúng: đoạn một → ảnh → ảnh → đoạn hai.
- Có ảnh xem trước trong chế độ Viết. Tên chương dài xuống dòng, không bị cắt; Enter không tạo dòng mới.

Lỗi gốc của "ảnh luôn ở đầu chương": nút chèn đặt ảnh ở vị trí con trỏ, mà khi chưa bấm vào bài thì con trỏ nằm ở vị trí 0.

## Bổ sung 02/11/2026 (2): ảnh không còn hiện dòng URL, font Be Vietnam Pro cho nội dung chương

- Chế độ Viết: dòng `![…](asset:…)` được thay bằng chính bức ảnh (kèm chú thích). Dòng đó vẫn nằm trong file chương, vì nó giữ vị trí của ảnh.
  - Kéo ảnh trong bài để dời chỗ.
  - Nút × (hiện khi rê chuột) bỏ ảnh khỏi chương; ảnh vẫn còn trong thư viện ảnh.
  - Cả hai thao tác đều hoàn tác được (Ctrl/⌘+Z).
- Nội dung chương khi viết, đọc và review (diff) dùng **Be Vietnam Pro**, cùng font với giao diện (biến `--font-read`). Tên bộ truyện và tiêu đề trang vẫn dùng Literata.
- E2E (workerd) kiểm tra thứ tự trong editor: chèn → kéo từ panel → dời ảnh trong bài xuống sau đoạn hai → bỏ một ảnh bằng × → lưu → thứ tự khi đọc khớp. Editor không còn chữ `asset:`.
- Lỗi tìm ra khi chạy test và đã sửa: dời ảnh trong bài cần `dropEffect = "move"` khớp với `effectAllowed`. Nếu không khớp, trình duyệt chặn thả.
- Kết quả: unit 45/45, E2E bản tĩnh 26/26, E2E Cloudflare 6/6, lint/typecheck sạch.

## Bổ sung 03/11/2026: tốc độ trang Đề xuất, nút Làm mới, thanh cuộn, font

- **Nguyên nhân chậm**: để biết đề xuất sửa file nào, ứng dụng tìm gốc chung của `main` và nhánh đề xuất. Thuật toán cũ duyệt **toàn bộ lịch sử `main`** trước, mỗi commit một lần đọc R2, tuần tự. Lịch sử càng dài (mỗi lần "Lưu phiên bản" thêm một commit) thì trang càng chậm.
- **Sửa**:
  - Tìm từ cả hai phía cùng lúc, đọc song song theo tầng, dừng khi gặp nhau.
  - Cache đối tượng bất biến (commit/blob theo sha) trong bộ nhớ Worker giữa các request, giới hạn 24 MB, LRU.
  - Tóm tắt các đề xuất song song.
- **Test** `tests/unit/merge-base.test.ts`: lịch sử 300 phiên bản, đề xuất tách từ phiên bản 290.
  - Thuật toán cũ: **305** lần đọc. Thuật toán mới: dưới 40. Đã kiểm tra ngược: chạy test với mã cũ thì trượt.
  - Có thêm các trường hợp tổ tiên trực tiếp, trùng nhau, commit merge.
- **Nút Làm mới**: hiện vòng xoay và chữ "Đang làm mới…" khi đang tải, rồi "cập nhật hh:mm:ss". E2E dùng phản hồi bị làm chậm để thấy được trạng thái này.
- **Thanh cuộn**: một kiểu mảnh, cùng màu cho toàn trang (`scrollbar-width: thin`).
- **Font nội dung chương**: trả về Literata.
- **Kết quả**: unit 47/47, E2E bản tĩnh 28/28, E2E Cloudflare 6/6, lint/typecheck sạch.

## Bổ sung 05/11/2026: đăng nhập Google (Firebase), người đọc, chế độ đọc

- **Kiểm tra token** theo đúng `firebase-admin-node/src/auth/token-verifier.ts` (đọc mã nguồn): RS256 + `kid`, `aud` = project ID, `iss` = `https://securetoken.google.com/<project>`, `sub` 1–128 ký tự.
  - Khoá công khai lấy từ `.../service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`. Đã kiểm tra: trả về đúng các `kid` như endpoint x509 mà Admin SDK dùng.
  - Thêm điều kiện: chỉ nhận đăng nhập bằng Google, email đã xác minh.
- **CSP** cho popup Google, theo mã nguồn `firebase-js-sdk`: `apis.google.com/js/api.js`, iframe `<authDomain>/__/auth/iframe`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`.
- **Unit** (52/52):
  - email biên tập thì là editor, còn lại là người đọc;
  - từ chối: sai `aud`/`iss`, hết hạn, ký bằng khoá khác, không phải Google, email chưa xác minh;
  - cookie phiên HttpOnly + SameSite=Strict, có kiểm tra Origin;
  - người đọc chỉ thấy chương truyện (Act 0 bị ẩn, mở ghi chú Act 0 trả 404); 8 API biên tập trả 403; ảnh vẫn tải được;
  - token agent đúng/sai.
- **E2E Cloudflare** (7/7):
  - tác giả mở "Chế độ đọc" → mục lục → chương → chương sau → "Chế độ viết";
  - người đọc vào trang biên tập thì bị chuyển sang `/read`; có watermark email; `user-select: none`; copy, chuột phải và selectstart bị chặn; Ctrl+A không bôi đen;
  - rời cửa sổ thì nội dung mờ; bản in bị ẩn; API biên tập trả 403.
- **Build thử với cấu hình Firebase giả**: màn hình "Đăng nhập bằng Google" hiện đúng ở `/library` và `/read`; CSP có đủ các domain; không có lỗi JavaScript.
- **CHƯA kiểm chứng**: popup Google thật với project Firebase của bạn. Môi trường của tớ không có project và tài khoản để thử. Làm theo `docs/FIREBASE_SETUP.md`, bước 3.
