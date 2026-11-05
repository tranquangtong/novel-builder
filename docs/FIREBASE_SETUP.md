# Đăng nhập bằng Google (Firebase) và chế độ đọc

Sau khi thiết lập:
- Ai có tài khoản Google cũng đăng nhập được và trở thành **người đọc**. Người đọc chỉ thấy **chế độ đọc**: mục lục và các chương truyện. Họ không thấy Act 0 (outline, trivia), đề xuất, lịch sử hay bản nháp. Máy chủ chặn mọi API khác (403), kể cả khi người đọc gọi thẳng.
- Email trong biến `EDITOR_EMAILS` (của bạn: `tongquangtran@gmail.com`) có **cả hai vai trò**: biên tập như hiện nay, và mục **Chế độ đọc** ở menu trái để đọc như người đọc.

## 1. Bật đăng nhập Google trong Firebase

Trong [Firebase console](https://console.firebase.google.com/), mở project của bạn:

1. **Build → Authentication → Get started** (nếu chưa bật).
2. Tab **Sign-in method** → **Add new provider** → **Google** → bật **Enable**, chọn *support email* → **Save**.
3. Tab **Settings** → **Authorized domains** → **Add domain** → `novel-builder.tongquangtran.workers.dev`.
4. **Project settings** (bánh răng) → tab **General** → mục **Your apps**:
   - Nếu chưa có web app thì bấm **</>** để tạo (không cần Firebase Hosting).
   - Chép 4 giá trị trong `firebaseConfig`: `apiKey`, `authDomain`, `projectId`, `appId`.

> Cấu hình web của Firebase **không phải bí mật**: Firebase thiết kế để nó nằm trong trang web. Quyền thật do Worker quyết định sau khi kiểm tra chữ ký của token đăng nhập.

## 2. Khai báo cho GitHub Actions

Repo `novel-builder` → **Settings → Secrets and variables → Actions**.

**Tab Variables**:

| Tên | Giá trị |
|---|---|
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` (dạng `<project>.firebaseapp.com`) |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_APP_ID` | `appId` |
| `EDITOR_EMAILS` | kiểm tra lại: có `tongquangtran@gmail.com` |

**Tab Secrets**, token cho agent: cần thiết vì bước 4 tắt Cloudflare Access, nên service token cũ sẽ không còn dùng được.

1. Tạo token trên máy bạn:

   ```bash
   node -e "console.log('nbagent_' + require('crypto').randomBytes(24).toString('hex'))"
   ```

2. Tạo secret `NB_AGENT_TOKENS` với giá trị `claude:nbagent_…` (nhiều agent thì cách nhau bằng dấu phẩy).
3. Đưa token đó cho môi trường của agent qua **biến môi trường**, không dán vào chat. Agent gửi header `Authorization: Bearer nbagent_…` (xem `AGENTS.md`, mục 8).

Sau đó vào tab **Actions** → **Re-run all jobs**.

## 3. Tắt Cloudflare Access và thử đăng nhập Google

Khi Access còn bật, người đọc sẽ bị trang đăng nhập của Cloudflare chặn trước. Worker cũng vẫn nhận phiên Access, nên bạn chưa thấy màn hình đăng nhập Google. Hãy tắt Access:

- **Zero Trust → Access controls → Applications**: xoá ứng dụng của `novel-builder.tongquangtran.workers.dev`.
- Hoặc tắt ở **Workers & Pages → novel-builder → Settings → Domains & Routes**, mục workers.dev.

Sau đó kiểm tra:
1. Mở cửa sổ ẩn danh và vào trang: phải thấy màn hình **Đăng nhập bằng Google**.
2. Đăng nhập bằng `tongquangtran@gmail.com`: vào trang biên tập, menu trái có **Chế độ đọc**.
3. Đăng nhập bằng một tài khoản Google khác: chỉ thấy chế độ đọc, có watermark ghi email đó.

Nếu có gì không ổn, bật lại Access là trang trở về như cũ. Mã mới vẫn nhận phiên Access.

Trang tĩnh (HTML/JS) sau đó công khai, nhưng không chứa nội dung truyện. Mọi nội dung đều đi qua API, và API kiểm tra đăng nhập cho từng request.

Tuỳ chọn: xoá `ACCESS_TEAM_DOMAIN` và `ACCESS_AUD` khỏi Variables.

## Cách hoạt động

- Trình duyệt đăng nhập Google bằng Firebase (popup), lấy **ID token** (hết hạn sau khoảng 1 giờ, Firebase tự gia hạn) và gửi lên `POST /api/session`. Worker kiểm tra token rồi đặt cookie `nb_session` (HttpOnly, Secure, SameSite=Strict). Cookie này giúp cả ảnh trong chương cũng được xác thực.
- Worker kiểm tra token đúng như Firebase Admin SDK (`firebase-admin-node`, `src/auth/token-verifier.ts`):
  - chữ ký RS256 bằng khoá công khai của Google, có `kid`;
  - `aud` = project ID, `iss` = `https://securetoken.google.com/<project>`;
  - `sub` dài 1–128 ký tự, token còn hạn.
  - Thêm hai điều kiện: phải đăng nhập bằng Google (`firebase.sign_in_provider = google.com`) và email đã xác minh.
- Vai trò: email nằm trong `EDITOR_EMAILS` là biên tập, còn lại là người đọc.

## Chống copy và chụp màn hình: làm được gì, không làm được gì

Ở chế độ đọc:
- **Đã có**:
  - không bôi đen, copy, cắt hay chuột phải; chặn Ctrl/⌘ + C, A, S, P, U;
  - bản in ra trống;
  - nội dung bị mờ khi cửa sổ mất focus hoặc khi bấm PrintScreen (và cố xoá clipboard);
  - **watermark mờ ghi email người đọc và ngày** phủ lên nội dung.
- **Không thể chặn**: trình duyệt **không cho** trang web ngăn chụp màn hình bằng công cụ của hệ điều hành (Snipping Tool, ⌘⇧4…), quay màn hình hay chụp bằng điện thoại. Người rành kỹ thuật cũng có thể đọc nội dung qua DevTools.
- Watermark là lớp bảo vệ thực tế nhất: ảnh chụp bị phát tán vẫn biết của tài khoản nào.
