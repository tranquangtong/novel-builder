# AGENTS.md — Quy tắc cho agent làm việc trên bản thảo “The Last Miracle”

Repository này là **bản thảo riêng tư** của tác giả. Bạn (agent) chỉ được đề xuất thay
đổi; tác giả là người quyết định nhập vào bản chính. Đọc hết file này trước khi làm việc.

## 1. Bố cục repository

| Đường dẫn | Ý nghĩa | Ai được sửa |
|---|---|---|
| `content/project.json` | Thông tin dự án, mục tiêu số chữ | Tác giả |
| `content/index.json` | **Chỉ mục tự sinh** (id, tiêu đề, Act, thứ tự, số chữ, blob sha) | Không ai sửa tay — ứng dụng tự sinh lại |
| `content/acts/<act_id>.md` | Act: frontmatter `id`, `title`, `order` + mô tả | Theo nhiệm vụ |
| `content/chapters/<chapter_id>.md` | Một chương/một file. Frontmatter: `id`, `title`, `act_id`, `order`, `status`, `pov` | Theo nhiệm vụ |
| `content/canon/characters/` | **Canon đã chốt** về nhân vật | Chỉ khi nhiệm vụ yêu cầu rõ |
| `content/canon/world/` | **Canon đã chốt** về thế giới, vật phẩm, luật lệ | Chỉ khi nhiệm vụ yêu cầu rõ |
| `content/canon/timeline/` | **Sự kiện đã xảy ra trong bản thảo** (có `source_chapter`) | Theo nhiệm vụ |
| `content/canon/knowledge/` | **Kiến thức của từng nhân vật tại từng thời điểm** | Theo nhiệm vụ |
| `content/outlines/` | **Kế hoạch** — chưa xảy ra, có thể đổi | Theo nhiệm vụ |
| `content/summaries/<chapter_id>.md` | **Tóm tắt dẫn xuất**, ghi `source_blob` của chương nguồn | Agent được tạo/cập nhật |
| `content/reviews/` | Ghi chú review, báo cáo continuity | Agent được tạo |

`id` của chương **không bao giờ thay đổi** — kể cả khi đổi tên hay chuyển Act. Không đổi tên file chương.
Số chương hiển thị (Ch 10, Ch 11…) được tính từ `order`, không lưu trong file.

## 2. Đọc đúng phạm vi

1. Đọc `content/index.json` trước để định vị chương (không mở toàn bộ 200+ chương).
2. Nếu tác giả đưa **Gói tài liệu cho nhiệm vụ** (manifest JSON), chỉ đọc các file trong
   manifest, đúng phiên bản `blob`/`commit` được ghi. Nếu thấy cần thêm file, hãy nêu rõ
   lý do trong mô tả PR thay vì tự mở rộng phạm vi.
3. **Tóm tắt không thay thế nguyên văn.** Khi xác minh một chi tiết (ai nói câu gì, ai biết
   điều gì, vật gì ở đâu), phải đọc nguyên văn chương. Nếu `source_blob` của tóm tắt khác blob
   hiện tại của chương, tóm tắt đã **cũ** — đừng tin nó.
4. Không tuyên bố đã “review toàn truyện” hay “kiểm tra toàn bộ continuity” nếu mới đọc một
   phần. Luôn liệt kê chính xác các chương/file đã đọc.

## 3. Phân biệt các tầng sự thật

- **Canon đã chốt** (`content/canon/characters`, `content/canon/world`, `status: canon`): sự thật của thế giới.
- **Kế hoạch** (`content/outlines`): dự định, chưa phải sự thật.
- **Đề xuất chưa duyệt** (PR đang mở, file có `status: proposed`): chưa phải sự thật.
- **Sự kiện đã xảy ra** (`content/canon/timeline`): chỉ những gì đã viết trong bản thảo.
- **Kiến thức nhân vật** (`content/canon/knowledge`): ai biết gì, từ chương nào.

Một điều là canon **không có nghĩa** nhân vật đã biết. Ví dụ: “Kiếm Tro là di vật của Ben”
là canon, nhưng Puna và đồng đội **chưa biết** cho tới khi bản thảo cho họ biết. Đừng để nhân
vật hành động như thể đã biết điều họ chưa được biết.

## 4. Quy trình mỗi nhiệm vụ

1. Mỗi nhiệm vụ một **branch riêng**, tạo từ `main` mới nhất, tên dạng `agent/<mô-tả-ngắn>` (Claude Code có thể dùng `claude/<…>`). Không dùng lại branch của PR đã merge.
2. Chỉ sửa những file trong phạm vi được yêu cầu. Không “tiện tay” sửa chương khác, không
   format lại toàn file, không đổi dấu câu/chính tả ngoài phạm vi.
3. **Không sửa `content/index.json`** (ứng dụng tự sinh lại; sửa tay gây xung đột merge).
4. Không push lên `main`, không force-push, không rewrite lịch sử.
5. Mở **pull request** vào `main` với mô tả gồm:
   - Mục đích nhiệm vụ.
   - Danh sách chương bị ảnh hưởng (Ch số · tiêu đề · `id`).
   - Các file đã đọc để làm nhiệm vụ.
   - Thay đổi canon (nếu có) — xem mục 6.
   - Các điểm cần tác giả quyết định.

## 5. Continuity hay lựa chọn nghệ thuật?

- **Lỗi continuity**: mâu thuẫn có thể chỉ ra bằng trích dẫn (tên, thời gian, vị trí vật,
  ai biết gì, vết thương, thời tiết…). Ghi rõ: trích dẫn A (chương, đoạn) mâu thuẫn với trích
  dẫn B (chương, đoạn).
- **Lựa chọn nghệ thuật**: giọng văn, nhịp, mức độ miêu tả, chemistry, độ thân mật, sắc thái
  nhân vật. Chỉ **nhận xét** trong mô tả PR hoặc `content/reviews/`; **không tự sửa**.
- Không tự làm mềm, làm nhạt hay viết lại chemistry, mức độ thân mật hoặc sắc thái nhân vật
  chỉ vì khác sở thích biên tập. Nếu nghi ngờ, hỏi tác giả.
- Không tự thêm/bớt nội dung chỉ để đạt mục tiêu 2.500–3.000 chữ.

## 6. Thay đổi canon

Mọi thay đổi trong `content/canon/` phải được nêu riêng trong mô tả PR:
- Điều gì thay đổi (trước → sau).
- Lý do và nguồn (chương/đoạn).
- Ảnh hưởng: các chương, timeline, kiến thức nhân vật có thể bị ảnh hưởng.
Thay đổi chưa được tác giả chốt thì ghi `status: proposed`.

## 7. Tóm tắt dẫn xuất

`content/summaries/<chapter_id>.md` phải có frontmatter:

```yaml
chapter_id: ch_xxxxxxxxxx
source_blob: <git blob sha của content/chapters/<chapter_id>.md lúc tóm tắt>
source_commit: <commit sha>
```

Lấy blob sha bằng `git rev-parse HEAD:content/chapters/<id>.md` hoặc từ `content/index.json`.
