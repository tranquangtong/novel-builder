# Duyệt bộ ảnh train LoRA

Lập ngày 2026-11-18. Tác giả duyệt từng ảnh trước khi train trong Draw Things.

## Cách duyệt

- Xem nhanh: `dan_candidates_grid.jpg`, `zen_candidates_grid.jpg` (số trên góc ảnh = số file).
- Ảnh gốc và caption: `candidates/<nhân vật>/<tên>_XX.png` + `.txt`.
- Ảnh cắt từ sheet: `sheet/<nhân vật>/`. Nên giữ hết, vì đây là chuẩn mặt.
- Đánh dấu vào cột **Giữ?** (có / bỏ / sửa caption). Claude sẽ dọn theo đánh dấu rồi đóng gói bộ train.

Nguồn: 7 ảnh cắt từ sheet (Claude), 28 ảnh Codex gen bằng imagegen của ChatGPT, theo sheet. Mỗi nhân vật cần 10–20 ảnh tốt.

## Dan (`dan_tlm`)

| Ảnh | Khung | Nhận xét của Claude | Giữ? |
|---|---|---|---|
| sheet_01–04 | toàn thân, nửa người, mặt, combat | Chuẩn mặt. `sheet_04` có hiệu ứng phép tím, caption đã ghi. | |
| 01 | mặt, chính diện | Giống sheet, kính và thánh giá đúng. | |
| 02 | mặt, 3/4 phải, cười trêu | Tốt. Codex ghi góc gần giống 03. | |
| 03 | mặt, 3/4 phải, nghiêm | Tốt, mặc vest. | |
| 04 | mặt, nghiêng | Tốt, có góc nghiêng hiếm. | |
| 05 | mặt, minh họa | Đúng nét sheet. | |
| 06 | nửa người, chính diện | Tốt, vai hơi hẹp. | |
| 07 | nửa người, vest | Tốt. | |
| 08 | nửa người, sơ mi xắn tay | Tốt. | |
| 09 | nửa người, nhìn xuống | Tốt. | |
| 10 | nửa người, minh họa | Tốt. | |
| 11 | toàn thân | Mặt nhỏ; giúp học dáng. | |
| 12 | toàn thân, vest | Codex ghi vai hẹp hơn canon (Dan vai rộng). Cân nhắc bỏ. | |
| 13 | toàn thân, nghiêng | Mặt nhỏ. | |
| 14 | toàn thân, minh họa | Tốt. | |

Lưu ý chung: Dan trong cả bộ hơi mảnh so với canon "cao, vai rộng hơn Zen". Nếu LoRA ra người gầy, thêm `broad shoulders` vào prompt khi gen.

## Zen (`zen_tlm`)

| Ảnh | Khung | Nhận xét của Claude | Giữ? |
|---|---|---|---|
| sheet_01–03 | toàn thân, nửa người, mặt | Chuẩn mặt. | |
| 01 | mặt, chính diện | Giống sheet; tóc và mái đúng. | |
| 02 | mặt, 3/4 trái, cười ngại | Tốt. | |
| 03 | mặt, 3/4 phải, đỏ mặt | Tốt. | |
| 04 | mặt, nghiêng | Tốt; tóc che gáy rõ. | |
| 05 | mặt, cười | Caption ghi "illustration" nhưng ảnh gần như ảnh chụp: sửa caption thành `realistic photography` hoặc bỏ. | |
| 06 | nửa người, chính diện | Tốt. | |
| 07 | nửa người, sơ mi lanh | Mặt hơi khác (cằm nhọn hơn). | |
| 08 | nửa người, sơ mi lanh, nhìn xuống | Mặt hơi khác. | |
| 09 | nửa người, cười | Tốt. | |
| 10 | nửa người, nghiêng | Caption ghi "illustration" nhưng ảnh gần như ảnh chụp: sửa caption hoặc bỏ. | |
| 11–13 | toàn thân | Mặt nhỏ, hơi cách điệu (Codex cũng ghi). Giúp học dáng, không giúp giữ mặt. | |
| 14 | toàn thân, minh họa | Tốt. | |

## Sau khi duyệt

1. Claude gom ảnh "giữ" của từng nhân vật vào một thư mục train, kèm caption.
2. Tác giả train trong Draw Things: model gốc **SDXL Base 1.0**, mỗi nhân vật một LoRA, từ khóa `dan_tlm` / `zen_tlm`.
3. Báo Claude tên file 2 LoRA; Claude gen thử chân dung rồi 3 cảnh theo `drawthings-plan.md`.
