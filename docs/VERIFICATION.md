# Kết quả kiểm chứng

Môi trường: Node 22.23, Next.js 16.4.2, React 19.2.9, Chromium (Playwright 1.63). Ngày 31/10/2026.

## Đã chạy thật

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| Lint | `npm run lint` | sạch |
| Typecheck | `npm run typecheck` | sạch |
| Unit/integration | `npm test` | **21/21** qua |
| Build production | `npm run build` | thành công. Mọi trang và API là `ƒ (Dynamic)`, không route nội dung nào được prerender tĩnh |
| E2E (build production, chế độ demo) | `npm run test:e2e` | **20/20** qua, chạy 2 lần liên tiếp |

### Các luồng có nguy cơ mất dữ liệu (E2E, `tests/e2e/flows.spec.ts`)

| Luồng | Test kiểm tra |
|---|---|
| Nhập tiếng Việt, reload, khôi phục nháp | Gõ câu có dấu và ngoặc kép “ ”, đếm chữ cập nhật ngay (+27 chữ, “—” không tính). Sau reload hiện “Đã khôi phục nháp” với đúng nội dung; kho chưa có nội dung đó |
| Lưu thành công | Trạng thái chuyển “Đã lưu… phiên bản …”; nội dung trên kho khớp; reload không còn nháp |
| Lưu thất bại | Chặn PUT trả 502: hiện “Lưu thất bại… Nháp vẫn an toàn”, **không** có thông báo thành công, kho không đổi, reload vẫn khôi phục được nháp |
| Phát hiện phiên bản mới từ bên ngoài | Agent (mô phỏng) sửa bản chính khi tác giả đang có nháp: hiện cảnh báo; bấm lưu bị từ chối (409), bản agent không bị ghi đè; xem được diff; “Giữ nội dung của tôi” rồi lưu thì thành công, bản agent vẫn nằm trong lịch sử |
| Nháp cũ sau khi kho đổi | Reload khi bản gốc của nháp đã cũ: cảnh báo “kể từ khi bạn bắt đầu nháp”, nháp vẫn hiển thị |
| Hai tab cùng sửa | Tab B nhận cảnh báo “đang được sửa ở tab khác” và ngừng tự lưu; IndexedDB vẫn giữ nháp tab A |
| Agent và tác giả cùng sửa một chương | Đề xuất báo xung đột, nêu đúng file, nút “Chấp nhận” bị vô hiệu |
| Review và merge | Diff hiển thị đoạn thêm; bình luận; chấp nhận thì trạng thái “Đã nhập” và nội dung có trên bản chính |
| Đề xuất đổi sau khi mở review | Agent đẩy thêm commit, tác giả bấm chấp nhận: bị từ chối (head khác), hiện cảnh báo, **không** nhập |
| Phục hồi riêng chương | Từ trang Lịch sử: trả Ch10–11 về bản khởi tạo; Ch8–9 và canon Kiếm Tro giữ nguyên từng byte; số commit tăng đúng 1 (không rewrite lịch sử). Từ panel Phiên bản: có xem trước diff rồi phục hồi |
| Không đọc/ghi khi chưa xác thực | 7 API đọc + PUT/merge trả 401 và không chứa nội dung; trang chuyển về `/login`; sai mã demo trả 401; request ghi từ origin khác trả 403 |
| Điều hướng 200 chương | Danh sách hiện 200 chương mà **không** có request nội dung chương nào; payload `/api/project` không chứa thân chương; mở 3 chương thì đúng 3 request, mỗi chương một lần |
| Đổi tên/chuyển Act | ID và đường dẫn file không đổi |
| Nhập văn bản | Cảnh báo trùng số, chương đã có, nội dung trước chương đầu. Mặc định bỏ qua chương trùng với bản thảo; giữ nguyên khoảng trắng kép, gạch ngang, ngoặc; CRLF thành LF |
| Xuất | Một chương và toàn bộ bản thảo (≥ 200 tiêu đề chương) |
| Gói tài liệu | Chỉ chương đích và lân cận; blob sha hợp lệ; đánh dấu tóm tắt đã cũ |
| Sáng/tối | Chuyển theme; dải DỮ LIỆU DEMO luôn hiển thị |

### Unit/integration (`tests/unit/`)

- `service.test.ts`: chạy với kho demo. Danh sách 200 chương đọc tối đa 6 blob; lưu tiếng Việt; giữ ID khi đổi tên/Act; từ chối lưu dựa trên bản cũ; tự thử lại khi file khác đổi; phục hồi Ch10–11 giữ Ch8–9 và canon; merge chỉ khi head không đổi; phát hiện xung đột cùng chương; từ chối tự approve.
- `github-store.test.ts`: **`GitHubStore` chạy với một GitHub REST API giả** (fetch giả dựng trên mini-git), mô phỏng hành vi ghi trong đặc tả OpenAPI chính thức. Kiểm tra: JWT của App → installation token (dùng khóa **PKCS#1** sinh ngẫu nhiên); lưu đúng chuỗi `POST git/trees → POST git/commits → PATCH git/refs (force=false)`; 422 không fast-forward thì thử lại; 409/405 khi merge thành lỗi tương ứng; danh tính bot từ `GET /app`.
- `domain.test.ts`: đếm chữ; frontmatter giữ nguyên từng byte; git blob sha khớp `git hash-object`; nhận diện chương khi nhập; diff theo đoạn; chặn path traversal.

### Kiểm tra giao diện

Đã chụp màn hình và xem bằng mắt các khổ 1440×900 (sáng và tối), 1024×768 và 820×1100: tổng quan, editor (font Literata có dấu tiếng Việt), cảnh báo xung đột, review đề xuất, canon/kiến thức nhân vật, lịch sử. Console trình duyệt không có lỗi trong các luồng trên.

## Đã xác minh bằng tài liệu chính thức

Không truy cập được docs.github.com và nextjs.org từ môi trường này, nên tôi đọc **nguồn** của tài liệu:

- `github/rest-api-description` (OpenAPI): `PUT /pulls/{n}/merge` có `sha` (*“SHA that pull request head must match to allow merge”*), 409 khi head không khớp, 405 khi không merge được; `PATCH /git/refs/{ref}` với `force` (*“Leaving this out or setting it to false will make sure you're not overwriting work”*); sự kiện review `APPROVE | REQUEST_CHANGES | COMMENT`.
- `github/docs` `src/github-apps/data/fpt-2022-11-28/server-to-server-permissions.json`: quyền cho từng endpoint đang dùng (Contents R/W; Pull requests R/W; bình luận PR cần Issues **hoặc** Pull requests write).
- `github/docs` `data/reusables/repositories/request-changes-tips.md`: *“Pull request authors cannot approve their own pull requests.”*
- `github/docs` trang *generating-a-user-access-token-for-a-github-app*: tham số `state`, `code_challenge` / `code_challenge_method=S256`, `code_verifier`.
- `vercel/next.js@v16.4.2` docs: `middleware` đổi tên thành `proxy` (bản này không dùng proxy; kiểm tra phiên nằm trong từng route và layout); cấu hình ESLint flat.
- README của `@octokit/auth-app` 8.3.1 và mã của `universal-github-app-jwt` (khóa PKCS#1 được tự chuyển trên Node).

## CHƯA kiểm chứng: cần credentials GitHub thật

Môi trường phát triển không có GitHub App, private key hay repo bản thảo, nên **chưa có lần chạy nào với GitHub thật**. Khi có credentials, hãy làm theo thứ tự:

1. **Kết nối GitHub → Kiểm tra kết nối thật**: tất cả các bước phải ✓, repo phải là private.
2. Đăng nhập bằng tài khoản khác `ALLOWED_GITHUB_LOGIN`: phải bị từ chối.
3. Lưu một chương: kiểm tra commit trên GitHub có đúng 2 file (chương + `content/index.json`) và tác giả là bạn.
4. Sửa cùng chương trên github.com rồi lưu từ ứng dụng: phải báo xung đột và giữ nháp.
5. Tạo nhánh và PR thủ công hoặc bằng agent, xem trong **Đề xuất**, bình luận, chấp nhận.
6. Đẩy thêm commit vào PR sau khi mở trang, bấm chấp nhận: phải bị từ chối (409).
7. Tạo xung đột thật (sửa cùng dòng trên `main`): `mergeable` phải là `false` và nút chấp nhận bị khóa.
8. Phục hồi hai chương từ một commit cũ: commit mới chỉ chứa hai file đó và chỉ mục.

Những điểm có khả năng khác với mô phỏng: thời gian GitHub tính `mergeable` (có thể `null` vài giây; ứng dụng báo “đang kiểm tra”); quy tắc branch protection; giới hạn tốc độ (secondary rate limits) khi xuất toàn bộ bản thảo (200 lần đọc blob, chạy song song tối đa 8).
