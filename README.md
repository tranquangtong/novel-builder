# The Last Miracle — Xưởng viết riêng tư

Web app để viết và quản lý tiểu thuyết dài kỳ, cộng tác với AI agent qua GitHub, xem lại đề xuất chỉnh sửa và phục hồi phiên bản. Bản thảo được lưu trong một **private GitHub repository** (repo bản thảo), còn repo này chứa **mã nguồn ứng dụng**.

Đây là công cụ riêng tư cho một tác giả, không phải website đăng truyện.

## Chạy thử nhanh (chế độ demo, không cần credentials)

Cần Node.js ≥ 20.9.

```bash
npm install
```

```bash
npm run dev
```

Mở http://localhost:3000 và nhập mã truy cập `demo`. Lần đầu chạy, ứng dụng tạo **200 chương DỮ LIỆU DEMO** trong `.demo-data/`: một mini-git trên đĩa có commit, nhánh và pull request mô phỏng. Đây không phải bản thảo thật, và giao diện luôn hiện dải "DỮ LIỆU DEMO".

Muốn thử như production thì chạy `npm run build && npm start`. Muốn tạo lại dữ liệu demo thì dùng `npm run demo:reset` hoặc nút trong trang **Kết nối GitHub**.

Ở chế độ demo, trang **Đề xuất chỉnh sửa** có khu **Mô phỏng agent**: mở đề xuất sửa chương, hoặc sửa thẳng bản chính để thử phát hiện xung đột.

## Kết nối GitHub thật

Xem [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md). Tóm tắt:

1. Tạo private repo cho bản thảo, khởi tạo có README.
2. Tạo GitHub App với quyền **Contents: RW** và **Pull requests: RW** (Metadata: R là bắt buộc), tắt webhook, đặt callback `<APP_URL>/api/auth/github/callback`.
3. Cài App **chỉ vào repo bản thảo**.
4. Điền `.env.local` theo `.env.example` với `DATA_MODE=github`.
5. Đăng nhập, mở **Kết nối GitHub → Kiểm tra kết nối thật**, rồi **Khởi tạo cấu trúc** nếu repo còn trống.

> Tích hợp GitHub thật **chưa được chạy với GitHub thật** trong môi trường phát triển vì không có credentials. Xem [docs/VERIFICATION.md](docs/VERIFICATION.md) để biết phần nào đã kiểm chứng và bằng cách nào.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` / `npm start` | Build và chạy production |
| `npm run lint` | ESLint (cấu hình Next.js) |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit/integration test (Vitest), gồm GitHubStore chạy với GitHub API giả |
| `npm run test:e2e` | E2E Playwright trên bản build production ở chế độ demo (chạy `npm run build` trước) |
| `npm run reindex -- <đường-dẫn-repo-bản-thảo>` | Sinh lại `content/index.json` trong một bản clone (bảo trì thủ công) |
| `npm run demo:reset` | Xóa dữ liệu demo |

## Kiến trúc

```
Trình duyệt (React, Next.js App Router)
 ├─ Nháp: IndexedDB  ← chỉ trên thiết bị, khóa theo repo + chapter ID + phiên bản gốc
 └─ fetch /api/*     ← cookie phiên (JWE, httpOnly, SameSite=Lax)
Máy chủ Next.js (Node)
 ├─ guarded(): kiểm tra phiên + chủ sở hữu được phép + origin cho mọi API nội dung
 ├─ ManuscriptService  ← logic nghiệp vụ dùng chung cho hai chế độ
 └─ RepoStore (interface)
     ├─ DemoStore   → mini-git trên đĩa (.demo-data)
     └─ GitHubStore → GitHub REST API bằng installation token của GitHub App
```

- **Chỉ một dịch vụ, không có database.** Repository là nguồn chính của mọi phiên bản đã lưu. Máy chủ chỉ cache dữ liệu bất biến theo sha, trong bộ nhớ.
- **Một lần lưu = một commit nguyên tử.** Chương, metadata và chỉ mục được ghi chung qua Git Data API (tree → commit → cập nhật ref với `force: false`). Không có trạng thái "lưu dở".
- **Phát hiện xung đột theo blob sha của từng file.** Nếu chương đã đổi so với phiên bản bạn dựa vào, máy chủ trả 409 và giữ nguyên nháp. Nếu chỉ có file khác đổi trong lúc lưu, máy chủ tự thử lại.
- **Không lộ bản thảo trong build:** mọi trang và API đều động (`ƒ` trong `next build`), nội dung chỉ được tải sau khi kiểm tra phiên.

Chi tiết schema và các luồng lưu/duyệt/phục hồi: [docs/SCHEMA_AND_FLOWS.md](docs/SCHEMA_AND_FLOWS.md).
Triển khai mà không làm lộ bản thảo: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Quy tắc cho agent (đặt trong repo bản thảo): [templates/manuscript/AGENTS.md](templates/manuscript/AGENTS.md).

## Các màn hình

1. **Tổng quan**: số chương, số chữ, tiến độ theo Act, nháp chưa lưu trên thiết bị, đề xuất đang chờ, phiên bản gần đây.
2. **Thư viện Act & chương**: tạo Act/chương, đổi thứ tự, lọc theo trạng thái.
3. **Viết/đọc chương**: editor Markdown (CodeMirror 6) có toolbar, tìm/thay trong chương (Ctrl+F), đếm chữ trực tiếp so với mục tiêu 2.500–3.000, chế độ đọc. Panel phụ có các tab Thông tin, Phiên bản, Canon, Ghi chú, Review.
4. **Canon & outline**: canon đã chốt · sự kiện đã xảy ra · kiến thức nhân vật · outline (kế hoạch) · tóm tắt (có cờ "đã cũ") · đề xuất chưa duyệt.
5. **Đề xuất chỉnh sửa**: danh sách pull request liên quan nội dung, diff theo đoạn và từ, bản render trước/sau, bình luận, chấp nhận (merge), yêu cầu sửa, đóng.
6. **Lịch sử & phục hồi**: mọi phiên bản; phục hồi một hoặc nhiều chương bằng phiên bản mới, có xem trước.
7. **Kết nối GitHub**: trạng thái cấu hình (không lộ giá trị), kiểm tra kết nối thật, hướng dẫn.
8. Thêm: **Gói tài liệu cho agent** và **Nhập & xuất**.

## Hạn chế còn lại

- Chưa kiểm chứng với GitHub thật (cần credentials). Danh sách việc cần thử khi có credentials nằm trong [docs/VERIFICATION.md](docs/VERIFICATION.md).
- Chỉ chấp nhận được **toàn bộ** đề xuất. Chấp nhận từng câu/đoạn thuộc giai đoạn sau.
- Xử lý xung đột theo kiểu "so sánh rồi chọn giữ bản của tôi hoặc bản trên kho". Chưa có công cụ gộp 3 chiều trong editor.
- Bình luận/review gửi từ ứng dụng mang danh tính GitHub App (`<app>[bot]`) kèm tên tác giả. Commit ghi tác giả là tài khoản của bạn.
- Khi GitHub báo không merge được, GitHub không cho biết file nào xung đột. Ứng dụng ước lượng bằng các file thay đổi ở cả hai phía.
- Nếu một PR đổi metadata ở nhiều chương, `content/index.json` có thể lệch sau merge. Ứng dụng phát hiện, vẫn hiển thị đúng (đọc trực tiếp các file lệch) và tự sửa ở lần lưu tiếp theo hoặc khi bấm "Cập nhật chỉ mục".
- Chế độ demo lưu trên đĩa cục bộ nên không dùng được trên serverless. Chế độ GitHub không cần đĩa.
- Chưa có: nhập trực tiếp Google Docs từ URL, xuất DOCX/PDF, cộng tác thời gian thực, gọi model AI trong ứng dụng.
