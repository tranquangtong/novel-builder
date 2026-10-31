# Thiết lập GitHub integration

Cách xác thực được chọn là **GitHub App**:

- **Đăng nhập**: OAuth web flow của GitHub App (user access token, có `state` và PKCE S256). Token người dùng chỉ dùng để gọi `GET /user` và so với `ALLOWED_GITHUB_LOGIN` / `ALLOWED_GITHUB_USER_ID`, rồi **bị bỏ đi**, không lưu.
- **Đọc/ghi repo**: installation token của App, do `@octokit/auth-app` xin và tự làm mới ở máy chủ. Private key và token không bao giờ ra trình duyệt.
- Phiên đăng nhập: cookie `nb_session` là JWE (A256GCM), `httpOnly`, `SameSite=Lax`, `Secure` ở production, hạn 12 giờ. **Mỗi request** đều kiểm tra lại tài khoản được phép theo cấu hình hiện tại, nên đổi `ALLOWED_GITHUB_LOGIN` là thu hồi phiên ngay.

## Các bước

1. **Repo bản thảo**: tạo repo **private**, ví dụ `the-last-miracle-manuscript`, tick "Add a README" để có nhánh `main`. Git Data API không tạo được commit đầu tiên trong một repo hoàn toàn rỗng.
2. **Tạo GitHub App**: *Settings → Developer settings → GitHub Apps → New GitHub App*
   - GitHub App name: tùy ý (ví dụ `tlm-studio-<tên bạn>`).
   - Homepage URL: URL ứng dụng.
   - **Callback URL**: `<APP_URL>/api/auth/github/callback` (local: `http://localhost:3000/api/auth/github/callback`).
   - Bỏ tick "Expire user authorization tokens" hay không đều được (ứng dụng không lưu user token).
   - **Webhook**: bỏ tick *Active*.
   - **Repository permissions**, chỉ cần:
     - Contents: **Read and write**: đọc file, tạo tree/commit, cập nhật ref, merge PR.
     - Pull requests: **Read and write**: đọc PR, review, bình luận, đóng PR.
     - Metadata: Read-only (bắt buộc).
   - Không cần quyền Organization hay Account. Không cần Issues (GitHub chấp nhận *Issues: write* **hoặc** *Pull requests: write* cho bình luận chung trên PR).
   - *Where can this GitHub App be installed?* → **Only on this account**.
3. Trong trang App: **Generate a new client secret**, rồi **Generate a private key** (tải file `.pem`). Ghi lại **App ID** và **Client ID**.
4. **Install App** → *Only select repositories* → chọn **chỉ** repo bản thảo. ID trong URL sau khi cài (`…/settings/installations/12345678`) chính là `GITHUB_APP_INSTALLATION_ID`.
5. Tạo `.env.local` từ `.env.example`:

```dotenv
DATA_MODE=github
SESSION_SECRET=<48 byte ngẫu nhiên>
APP_URL=http://localhost:3000
GITHUB_APP_ID=123456
GITHUB_APP_CLIENT_ID=Iv23li...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_PRIVATE_KEY=<base64 -w0 file.pem>
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_REPO_OWNER=<tài khoản của bạn>
GITHUB_REPO_NAME=the-last-miracle-manuscript
GITHUB_REPO_BRANCH=main
ALLOWED_GITHUB_LOGIN=<tài khoản của bạn>
ALLOWED_GITHUB_USER_ID=<id số>
```

   Private key định dạng PKCS#1 (`BEGIN RSA PRIVATE KEY`, GitHub cấp sẵn) được `universal-github-app-jwt` tự chuyển trên Node. Unit test đã kiểm tra trường hợp này với khóa PKCS#1 sinh ngẫu nhiên.

6. `npm run dev`, bấm **Đăng nhập với GitHub**, mở **Kết nối GitHub → Kiểm tra kết nối thật**. Mục kiểm tra lần lượt chạy JWT của App, đọc repo (và **cảnh báo nếu repo đang public**), đọc nhánh, đọc `content/project.json`, đọc PR.
7. Nếu repo chưa có cấu trúc, bấm **Khởi tạo cấu trúc**. Ứng dụng tạo `content/project.json`, Act đầu tiên, các thư mục và `AGENTS.md` trong một commit.

## Chuyển bản thảo từ Google Docs

1. Trong Google Docs: *Tệp → Tải xuống → Văn bản thuần (.txt)* hoặc *Markdown (.md)*.
2. Mở **Nhập & xuất** và chọn file. Kiểm tra bảng xem trước (số chương, Act, cảnh báo) rồi bấm **Nhập N chương**. Cả lần nhập là một commit.
3. Từ đây, **repo là bản chính**. Hãy để Google Docs ở chế độ chỉ xem hoặc lưu trữ. Ứng dụng không đồng bộ hai chiều.

## Cho agent làm việc

- Cấp cho agent (ví dụ Claude Code) quyền vào repo bản thảo qua cơ chế riêng của agent. App của ứng dụng này không dùng cho agent.
- Agent đọc `AGENTS.md`, làm trên nhánh `agent/...`, mở PR vào `main`. Ứng dụng hiển thị PR trong **Đề xuất chỉnh sửa**.
- Muốn giới hạn phạm vi: tạo **Gói tài liệu cho nhiệm vụ** rồi dán manifest vào yêu cầu gửi agent.
- Nếu bật branch protection yêu cầu review trên `main`: review từ ứng dụng mang danh tính `<app-slug>[bot]`. Merge qua API vẫn tuân theo luật bảo vệ nhánh; GitHub từ chối thì ứng dụng hiển thị lý do.
