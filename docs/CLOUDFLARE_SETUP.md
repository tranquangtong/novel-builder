# Chuyển xưởng viết sang Cloudflare (R2 + D1 + Access)

Sau khi làm xong các bước dưới đây:
- **Trang** chạy trên một Cloudflare Worker, ví dụ `https://novel-builder.<tên-bạn>.workers.dev`.
- **Nội dung chương, mọi phiên bản cũ và ảnh** nằm trong R2.
- **Danh sách bộ truyện** và "phiên bản hiện tại" của từng bộ nằm trong một database D1 riêng, dung lượng chỉ vài KB mỗi bộ.
- **Đăng nhập** do Cloudflare Access lo (mã OTP qua email, hoặc Google); trình duyệt không giữ token nào.
- **Mã nguồn** vẫn ở repo GitHub `novel-builder`. Mỗi lần push, GitHub Actions kiểm tra rồi deploy lên Cloudflare.

Bạn làm theo thứ tự. Mỗi bước ghi rõ cần chép giá trị nào sang đâu.

## 1. Tạo R2 bucket

Dashboard Cloudflare → **Storage & Databases → R2** → **Create bucket**:
- Tên: `novel-builder`
- **Không** bật Public access. Ảnh và chương chỉ đi qua Worker, sau khi đã đăng nhập.

Lần đầu bật R2, Cloudflare có thể yêu cầu thêm phương thức thanh toán, dù dùng trong hạn mức miễn phí (10 GB, 1 triệu lượt ghi, 10 triệu lượt đọc mỗi tháng).

## 2. Tạo D1 database

**Storage & Databases → D1** → **Create database**:
- Tên: `novel-builder`. Đây là database riêng, không đụng tới database của gymbro.
- Chép **Database ID** → dùng ở bước 4.

Không cần tạo bảng: workflow tự chạy `migrations/0001_init.sql`.

## 3. Tạo API token cho GitHub Actions

**My Profile → API Tokens → Create Token**:
- Chọn template **Edit Cloudflare Workers**.
- Thêm quyền: **Account → D1 → Edit**.
- Account Resources: chỉ tài khoản của bạn.
- Chép token → dùng ở bước 4.

Chép thêm **Account ID**: Workers & Pages → khung bên phải.

## 4. Khai báo cho GitHub Actions

Repo `novel-builder` → **Settings → Secrets and variables → Actions**.

**Secrets** (tab Secrets → New repository secret):

| Tên | Giá trị |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token ở bước 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |

**Variables** (tab Variables → New repository variable):

| Tên | Giá trị |
|---|---|
| `CF_D1_DATABASE_ID` | Database ID ở bước 2 (có biến này thì workflow mới deploy lên Cloudflare) |
| `EDITOR_EMAILS` | email được quyền sửa, ví dụ `tongquangtran@gmail.com` (nhiều email thì cách nhau bằng dấu phẩy) |
| `ACCESS_TEAM_DOMAIN` | để trống lúc này, điền ở bước 6 |
| `ACCESS_AUD` | để trống lúc này, điền ở bước 6 |
| `AGENT_CLIENT_IDS` | để trống nếu chưa cho agent dùng (bước 8) |

Sau đó vào tab **Actions** → chọn lần chạy mới nhất → **Re-run all jobs**. Job `deploy-cloudflare` sẽ:
1. áp dụng migration D1,
2. deploy Worker `novel-builder`, và in ra địa chỉ `https://novel-builder.<subdomain>.workers.dev`.

Lúc này mọi API trả lỗi **"Máy chủ chưa cấu hình Cloudflare Access"**. Đây là cố ý: chưa có Access thì không ai đọc được gì.

## 5. Bật Zero Trust (miễn phí)

Dashboard → **Zero Trust**. Lần đầu, chọn **team name** (ví dụ `tranquangtong`) và gói **Free**. Team domain của bạn sẽ là `https://<team-name>.cloudflareaccess.com`.

Nên bật thêm đăng nhập bằng Google: Zero Trust → Settings → Authentication → Login methods. Mặc định đã có **One-time PIN** (mã gửi qua email).

## 6. Bảo vệ Worker bằng Access

**Workers & Pages → novel-builder → tab Access → Protect this Worker behind Access**:
- Chọn **All traffic**.
- Policy: **Allow**, Include → **Emails** → email của bạn, cộng email những người được đọc.

Sau đó vào **Zero Trust → Access controls → Applications**, mở ứng dụng vừa tạo → **Additional settings** → chép **Application Audience (AUD) Tag**.

Quay lại GitHub → Variables:
- `ACCESS_TEAM_DOMAIN` = `https://<team-name>.cloudflareaccess.com`
- `ACCESS_AUD` = AUD Tag vừa chép

Rồi **Re-run** workflow.

## 7. Dùng thử và chuyển bản thảo

1. Mở `https://novel-builder.<subdomain>.workers.dev` → đăng nhập bằng email (nhập mã OTP).
2. Trang **Bộ truyện & kết nối** hiện khu vực **Bộ truyện trên Cloudflare**, ghi tên bạn kèm nhãn *biên tập*.
3. Trước khi chuyển: nhập các đề xuất còn mở trên GitHub (#2 Ch 13, #3 bỏ găng tay) vào bản chính, vì chỉ bản chính được chuyển.
4. Mở **Chuyển một bộ truyện từ repo GitHub sang Cloudflare**:
   - Repo: `tranquangtong/novel-thelastmiracle-manuscript`
   - Token GitHub: chỉ cần quyền đọc; dùng một lần, không được lưu.
5. Bấm **Mở** ở bộ truyện vừa chuyển → kiểm tra Thư viện, mở thử vài chương.

Từ đây bộ truyện trên Cloudflare là **bản chính**. Repo GitHub cũ giữ làm bản lưu trữ, vì lịch sử cũ vẫn nằm ở đó.

Muốn thêm bộ truyện mới: nhập tên rồi bấm **Tạo bộ truyện**.

## 8. (Tùy chọn) Cho agent làm việc qua API

1. **Zero Trust → Access controls → Service credentials → Service Tokens → Create**, tên ví dụ `claude-agent`. Chép **Client ID** và **Client Secret**; secret chỉ hiện một lần.
2. Trong ứng dụng Access của Worker, thêm một policy: Action **Service Auth**, Include → **Service Token** → `claude-agent`.
3. Thêm Client ID vào biến `AGENT_CLIENT_IDS` trên GitHub, rồi Re-run workflow.
4. Để Claude Code gọi được API: trong cài đặt môi trường của Claude (Network access → Allowed domains), thêm domain `novel-builder.<subdomain>.workers.dev`. Đưa Client ID/Secret cho Claude qua biến môi trường của môi trường đó, **không** dán vào chat.

Agent chỉ đọc được và mở đề xuất, bình luận. Nó không lưu thẳng vào bản chính, không nhập đề xuất, không xóa ảnh. Cách gọi API có trong `AGENTS.md`, mục 8.

## 9. Cho người khác đọc

Thêm email của họ vào policy **Allow** ở bước 6, **không** thêm vào `EDITOR_EMAILS`. Họ đăng nhập bằng mã OTP qua email và chỉ xem được: mọi thao tác ghi bị Worker chặn (403).

## 10. Sau khi chuyển xong

- Muốn tắt GitHub Pages: Settings → Pages → Source: None. Workflow vẫn build nhưng sẽ báo lỗi ở job `deploy-pages`; báo tôi để tôi gỡ job đó.
- Ảnh đã xóa nằm trong R2 ở `novels/<id>/trash/…`, có thể lấy lại thủ công trong dashboard R2.

## Dung lượng ước tính (gói miễn phí)

| | Dùng cho | Ước tính |
|---|---|---|
| R2 (10 GB) | Chương + mọi phiên bản + ảnh | 200 chương × 20 KB ≈ 4 MB mỗi lượt lưu toàn bộ; mỗi lần lưu một chương thêm khoảng 25 KB. Ảnh chiếm phần lớn. |
| D1 (500 MB/database, 5 GB toàn tài khoản) | 1 dòng mỗi bộ truyện + danh sách đề xuất | vài KB đến vài trăm KB |
| D1 ghi (100.000 dòng/ngày) | 1–2 dòng mỗi lần lưu | không đáng kể |
