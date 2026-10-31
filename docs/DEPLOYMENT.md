# Triển khai mà không làm lộ bản thảo

## Nguyên tắc

- **Không dùng GitHub Pages** hay hosting tĩnh: chúng không có backend để giữ secret và không bảo vệ được nội dung riêng tư. Ứng dụng cần một tiến trình **Node.js** (`next start`) hoặc một nền tảng chạy Next.js server/serverless.
- Bản thảo **không bao giờ nằm trong build**. Mọi route đều động (`ƒ` trong `next build`), dữ liệu chỉ được đọc lúc chạy qua API có kiểm tra phiên đăng nhập. Không có `generateStaticParams`, không có nội dung trong `public/`.
- Repo **mã nguồn ứng dụng** (repo này) và repo **bản thảo** nên tách riêng. Repo bản thảo phải là private.
- Secret chỉ đặt trong biến môi trường của nền tảng triển khai, không commit vào repo. `.env*` (trừ `.env.example`) đã nằm trong `.gitignore`.

## Lựa chọn

### A. Vercel (hoặc nền tảng tương tự hỗ trợ Next.js)

1. Import repo mã nguồn. Framework: Next.js.
2. Environment Variables: điền như `.env.example` với `DATA_MODE=github`, `APP_URL=https://<domain>`, và `SESSION_SECRET` mạnh.
3. Cập nhật Callback URL của GitHub App thành `https://<domain>/api/auth/github/callback`.
4. Nên bật thêm lớp bảo vệ của nền tảng (ví dụ Vercel Deployment Protection) cho các preview deployment.

> Chế độ demo lưu trên đĩa (`.demo-data`), **không** dùng được trên serverless. Chỉ dùng chế độ GitHub ở đây.

### B. Máy chủ/VPS hoặc container

```bash
npm ci
```

```bash
npm run build
```

```bash
NODE_ENV=production PORT=3000 npm start
```

Đặt sau reverse proxy có HTTPS (Caddy/Nginx), vì cookie phiên dùng cờ `Secure` ở production. Chỉ khi thử nội bộ không có HTTPS mới đặt `ALLOW_INSECURE_COOKIE=1`.

## Danh sách kiểm tra trước khi dùng thật

- [ ] Repo bản thảo **private** (mục "Kiểm tra kết nối thật" cảnh báo nếu không).
- [ ] App chỉ được cài vào **repo bản thảo**, với đúng quyền Contents RW + Pull requests RW.
- [ ] `ALLOWED_GITHUB_LOGIN` và `ALLOWED_GITHUB_USER_ID` đã đặt.
- [ ] `SESSION_SECRET` ≥ 32 ký tự ngẫu nhiên. Ở chế độ GitHub production, nếu thiếu thì mọi phiên bị từ chối.
- [ ] `DATA_MODE=github`. Ở production, chế độ demo bắt buộc có `DEMO_PASSCODE` riêng.
- [ ] HTTPS.
- [ ] Đăng xuất rồi mở `/api/project`: phải nhận **401**.

## Bảo mật đã có trong mã

- `guarded()` kiểm tra phiên cho **mọi** API nội dung. Các request ghi phải có `Content-Type: application/json` và cùng origin (chống CSRF, thêm vào SameSite=Lax).
- Đường dẫn file được kiểm tra chặt (`content/…`, không `..`), có test chống path traversal.
- Markdown được render **không** cho phép HTML thô (react-markdown mặc định), an toàn với nội dung do agent viết.
- Header: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Robots-Tag: noindex`. Mọi API trả `Cache-Control: private, no-store`.
- Trang trạng thái chỉ cho biết biến môi trường nào **đã đặt**, không bao giờ hiển thị giá trị.
