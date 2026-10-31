# Triển khai trên GitHub Pages mà không làm lộ bản thảo

## Mô hình

- **Repo `novel-builder` (public)**: mã của trang. GitHub Actions build (Next.js static export) và deploy lên GitHub Pages. Bản build **không chứa bản thảo**; dữ liệu demo trong mã là văn bản giả, có nhãn rõ.
- **Repo bản thảo (private)**: `content/…` và `AGENTS.md`. Chỉ được đọc/ghi bằng token có quyền trên repo này.
- **Không có máy chủ.** Trình duyệt gọi thẳng `https://api.github.com`. Tài liệu chính thức của GitHub ghi: *"The REST API supports cross-origin resource sharing (CORS) for AJAX requests from any origin."*

GitHub Pages không có backend và không bảo vệ được nội dung riêng tư; trang Pages luôn public. Vì vậy bản thảo **không bao giờ** nằm trong repo `novel-builder` hay trong bản build.

## Vì sao dùng fine-grained personal access token

Đăng nhập kiểu OAuth/GitHub App cần bước đổi `code` lấy token tại `github.com/login/oauth/access_token`. Bước này không hỗ trợ CORS (README của `@octokit/auth-app` cũng ghi *"The OAuth APIs to create user-to-server tokens cannot be used because they do not have CORS enabled"*), nên phải có máy chủ giữ client secret. Một trang tĩnh thuần không làm được, nên dùng **fine-grained PAT**:

- Chỉ chọn **một repo bản thảo** (Only select repositories).
- Quyền: **Contents: Read and write**, **Pull requests: Read and write** (Metadata: Read tự có).
- Có thời hạn (link tạo token điền sẵn 180 ngày, đổi được).

## Token được bảo vệ thế nào

- Lưu trong `sessionStorage` (mất khi đóng tab), hoặc `localStorage` nếu bạn tick "Ghi nhớ trên thiết bị này".
- **Content-Security-Policy** (thẻ meta): `connect-src 'self' https://api.github.com`. Trang không thể gửi dữ liệu tới địa chỉ nào khác; có E2E kiểm tra `fetch("https://example.com")` bị chặn.
- Không có script bên thứ ba: font được tự host, không dùng analytics hay CDN ngoài.
- Markdown render **không** cho phép HTML thô, nên nội dung do agent viết không chèn được script.
- `<meta name="referrer" content="no-referrer">`.
- Rủi ro còn lại: nếu chính trang bị chèn mã độc (ví dụ ai đó có quyền push vào `novel-builder`), mã đó có thể đọc token. Hãy giữ quyền push repo `novel-builder` cho riêng bạn, và xem lại các PR vào repo này.

## Danh sách kiểm tra

- [ ] Settings → Pages → Source: **GitHub Actions**.
- [ ] Repo bản thảo là **private**. Trang Kết nối báo ✗ nếu repo public.
- [ ] Token chỉ chọn repo bản thảo, đúng hai quyền ở trên.
- [ ] Chỉ tick "Ghi nhớ" trên máy riêng; thu hồi token khi mất máy.
- [ ] Workflow **Kiểm tra và triển khai GitHub Pages** xanh trước khi dùng bản mới.

## Nhánh và deploy

Workflow chạy kiểm tra trên **mọi nhánh**, nhưng chỉ **nhánh mặc định** của repo mới được deploy. Hiện nhánh mặc định là nhánh đầu tiên được push. Nếu sau này đổi sang `main`: Settings → General → Default branch, và kiểm tra Settings → Environments → `github-pages` cho phép nhánh đó.
