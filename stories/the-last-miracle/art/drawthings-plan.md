# Kế hoạch thử Draw Things trên MacBook

Ghi chú lập ngày 2026-11-17. Mục tiêu: gen ảnh Dan × Zen giữ đúng nét nhân vật, kể cả cảnh thân mật 16+, bằng model chạy local, không bị bộ lọc nội dung chặn. Claude Code điều phối qua API của Draw Things.

## Vì sao chọn hướng này

Kết quả thử ngày 2026-11-17 (ảnh trong `generated/`, `generated/test gemini/`):

| Tool | Ưu | Nhược |
|---|---|---|
| ChatGPT (Codex) | Chất tả thực tốt nhất, giữ mặt theo sheet tốt | Anatomy hay lỗi; chặn cảnh thân mật (`moderation_blocked`) |
| Gemini (Antigravity) | Anatomy tốt, cho gen cảnh thân mật | Tóc/mặt Zen hay lệch; hạn mức ảnh riêng (~5 giờ/lượt), không hiện trên bảng quota |
| Canva | Anatomy ổn | Chất lượng thấp; chặn cảnh thân mật |
| Claude Design | Không bị chặn | Chỉ vẽ SVG bằng code, không ra ảnh thật |

Trộn nhiều tool thì ảnh không đồng nhất. Một model local + LoRA riêng cho từng nhân vật giải quyết cả hai chuyện: đồng nhất và không bị kiểm duyệt.

Máy Windows (RTX 3050 Laptop, 4 GB VRAM) không đủ sức chạy Flux hay train LoRA, nên phần này làm trên MacBook.

## Yêu cầu máy

- Mac chip M (M1 trở lên), nên có từ 16 GB RAM. Train LoRA Flux cần nhiều RAM hơn; 8 GB thì chỉ nên dùng SDXL.
- Draw Things bản mới nhất (App Store, miễn phí).
- Claude Code trên Mac (hoặc trên máy Windows, gọi sang Mac qua mạng nội bộ).

## Bước 1. Cài Draw Things và model

1. Cài Draw Things.
2. Tải model gốc trong app. Thử theo thứ tự:
   - **Flux.1 [dev]** (bản lượng tử hóa 8-bit nếu RAM ít): chất lượng tốt nhất, chậm.
   - **SDXL** + một checkpoint realistic (cho bản tả thực) và một checkpoint anime/manhwa (cho bản manhwa).
3. Gen thử 1 ảnh đơn giản để biết tốc độ máy.

## Bước 2. Chuẩn bị bộ ảnh train LoRA

Mỗi nhân vật cần khoảng 10–20 ảnh, nhiều góc và biểu cảm, nền đơn giản.

- Nguồn có sẵn: `characters/char dan.png`, `char dan - combat mode.png`, `char zen.png`, và các ảnh trong `generated/` mà tác giả thấy giống nhân vật.
- Thiếu ảnh thì cho ChatGPT gen thêm ảnh **một nhân vật đứng một mình** (chân dung, nửa người, các góc nghiêng), không có cảnh nhạy cảm nên không bị chặn. Tác giả duyệt từng tấm trước khi đưa vào bộ train.
- Cắt từng ô trong character sheet thành ảnh riêng (mặt, nửa người, toàn thân).
- Chú thích mỗi ảnh bằng từ khóa kích hoạt: `dan_tlm` cho Dan, `zen_tlm` cho Zen, kèm mô tả ngắn.

Đặc điểm phải khớp (theo sheet và canon):

- **Dan** (20 tuổi, ma cà rồng thuần chủng): kính kim loại mảnh gọng chữ nhật, dây chuyền bạc có thánh giá nhỏ, tóc đen vuốt ngược rối, hàm sắc, cao và vai rộng hơn Zen, **không đeo găng tay**. Trang phục: vest tối, sơ mi trắng mở cổ.
- **Zen** (18 tuổi, người): tóc đen xoăn bông rất dày và rối, mái dài phủ trán tới lông mày, tóc dài che gáy; mặt trái xoan mềm, mắt nâu ấm, da sáng; không đeo kính, người mảnh, thấp hơn Dan. Trang phục học viện: blazer tối viền nhạt có huy hiệu, cà vạt sọc xanh navy, túi da nâu đeo chéo.

## Bước 3. Train LoRA trong Draw Things

1. Mở mục train LoRA trong app (Draw Things có sẵn tính năng train trên máy).
2. Train riêng từng nhân vật, trên đúng model gốc sẽ dùng để gen (Flux hoặc SDXL).
3. Gen thử chân dung từng nhân vật với LoRA, so với sheet. Chưa giống thì thêm ảnh hoặc chỉnh số bước rồi train lại.

## Bước 4. Bật API để Claude Code điều phối

1. Trong Draw Things, bật **API Server** (HTTP). Ghi lại port; Draw Things thường dùng API kiểu A1111, endpoint `/sdapi/v1/txt2img` và `/sdapi/v1/img2img`. **Kiểm tra lại trong bản app đang dùng**, vì ghi chú này viết khi chưa thử trực tiếp.
2. Nếu Claude Code chạy trên máy Windows: cho phép kết nối trong mạng nội bộ và ghi lại IP của Mac.
3. Báo cho Claude: địa chỉ API, tên model gốc, tên 2 file LoRA và từ khóa kích hoạt. Claude sẽ viết script gọi API, lưu ảnh vào `generated/`.

## Bước 5. Gen lại 3 cảnh thử

Gen mỗi cảnh hai bản, tả thực và manhwa, để so với các bản cũ trong `generated/test gemini/`.

**Bản tả thực**: ảnh chụp như khung hình phim truyền hình, da thật, ống 85mm, khẩu f/1.8, film grain nhẹ; không minh họa, không anime, không nét cọ.

**Bản manhwa**: tranh webtoon tình cảm, line art sạch, đổ bóng cel mềm, mắt chi tiết, tóc bóng; không tả thực, không 3D.

1. **Thân mật, phòng trọ** (ban đêm). Phòng trọ gỗ nhỏ, đèn dầu ấm, trăng qua cửa sổ. Dan ngồi tựa đầu giường, sơ mi trắng mở cúc. Zen ngồi giữa hai chân Dan, tựa lưng vào ngực Dan, áo sơ mi vải lanh trễ một bên vai. Dan vòng tay ôm eo Zen, cúi mặt sát cổ Zen, môi gần chạm da. Zen mắt khép hờ, đỏ mặt tới tai, một tay đặt lên cẳng tay Dan. Gợi cảm nhưng không lộ: cả hai mặc quần, không khỏa thân, không hôn.
2. **Hành lang tu viện** (hoàng hôn). Hai người ngồi cạnh nhau trên ghế đá, ánh chiều qua kính màu. Zen tựa đầu lên vai Dan, mắt nhắm, hơi đỏ mặt, cười nhẹ. Dan quàng một tay qua vai Zen, nhìn xuống Zen với nụ cười dịu, hơi trêu. Trang phục đúng như sheet.
3. **Hút máu** (ban đêm, phòng tối, trăng và một đèn lồng). Dan đứng sau ôm chặt Zen, một tay vắt ngang ngực Zen, tay kia ôm eo. Dan cúi bên cổ Zen, răng nanh cắm vào da, một vệt máu mảnh chảy xuống xương quai xanh. Zen nghiêng đầu để lộ cổ, một mắt nhắm, mắt kia hé mơ màng liếc về phía Dan, mày hơi nhíu vì nhói, môi hé, má và tai đỏ, rõ là đang tận hưởng. Dan mắt khép hờ, tối lại vì ham muốn, nhìn mặt Zen qua viền kính, vừa chiếm hữu vừa dịu dàng. Không bạo lực, không lộ. Cả hai mặc đủ đồ; cổ áo sơ mi Zen kéo mở bên bị cắn, cà vạt nới lỏng. Không đặt tay lên vai hay bắp tay Zen.

Quy tắc chung cho mọi cảnh:

- Mặt và tóc phải khớp sheet; mỗi người đúng hai tay, mỗi tay năm ngón.
- Mức độ thân mật theo canon: 16+, gợi cảm, không cảnh nóng; cả hai trên 18 tuổi và tự nguyện. Nụ hôn đầu chỉ xảy ra ở Act 5, nên các cảnh trước đó không có hôn môi.
- Cảnh hai người dùng hai LoRA cùng lúc dễ bị lẫn mặt. Nếu bị: gen theo vùng (regional prompt), hoặc gen xong rồi inpaint lại từng mặt với LoRA tương ứng.

## Bước 6. QC

Giữ quy trình 2 vòng QC như khi viết truyện. Bảng kiểm cho mỗi ảnh:

- Số tay và số ngón của từng người; khớp vai, khuỷu.
- Dan: kính, thánh giá, tóc, không găng tay.
- Zen: tóc (mái phủ trán, gáy che), mặt so với sheet.
- Trang phục đúng cảnh.
- Độ gợi cảm đúng mức canon.

Lỗi nhỏ thì inpaint, không gen lại cả ảnh. Chỉ ảnh tác giả duyệt mới chuyển sang `characters/` hoặc `scenes/` (xem `README.md`).

## Đã kiểm thực tế (2026-11-17/18, MacBook M1 Pro 16 GB)

- API Server HTTP chạy ở `127.0.0.1:7860`, endpoint `/sdapi/v1/txt2img` trả ảnh base64. Cấu hình hiện tại của app đọc ở `/sdapi/v1/options` (trường `model` = tên file model đang chọn).
- API Server **không tự bật lại** khi app khởi động lại; phải bật tay.
- Đổi model ngay trong payload bằng `"model": "<tên file>"`, không cần chạm app. Tên file:
  - SDXL Base: `sd_xl_base_1.0_f16.ckpt` (gốc để train LoRA)
  - Tả thực: `juggernaut_xl_ragnarok_q6p_q8p.ckpt`
  - Manhwa: `animagine_xl_v3.1_f16.ckpt` (prompt dạng tag, `clip_skip` 2)
- Key lạ ở cấp ngoài cùng bị từ chối (HTTP 422). **IP-Adapter Face không nhận ảnh mẫu qua HTTP**: gửi ảnh hay không, kết quả như nhau. Muốn giữ mặt qua API thì dùng LoRA.
- Tốc độ: khoảng 115 giây/ảnh 832×1216, 28–30 bước.
- Prompt phải ghi rõ `East Asian`; không ghi thì model ra mặt người phương Tây.
- Script gọi API: `tools/dt_gen.py`. Bộ ảnh train: `lora-dataset/` (xem `lora-dataset/REVIEW.md`).

## Câu mở đầu khi bắt đầu trên Mac

> Đọc `stories/the-last-miracle/art/drawthings-plan.md`. Draw Things đã chạy trên Mac, API ở `<địa chỉ:port>`, model `<tên>`, LoRA `<dan>` và `<zen>`. Gen lại 3 cảnh thử theo bước 5, rồi QC theo bước 6.
