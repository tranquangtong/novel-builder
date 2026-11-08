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
| `content/chapters/<chapter_id>.md` với `act_id` của **Act 0** (Act có `kind: notes`, tên “Act 0 · Outline & Trivia”) | **Ghi chú viết truyện**: outline, trivia, thiết lập nhân vật. Không phải chương truyện: không đánh số, không tính vào số chữ. Frontmatter phụ: `note_kind`, `migrated_from` | Chỉ khi nhiệm vụ yêu cầu rõ |
| `content/canon/characters/` | *(kiểu cũ — ứng dụng chuyển vào Act 0)* **Canon đã chốt** về nhân vật | Chỉ khi nhiệm vụ yêu cầu rõ |
| `content/canon/world/` | **Canon đã chốt** về thế giới, vật phẩm, luật lệ | Chỉ khi nhiệm vụ yêu cầu rõ |
| `content/canon/timeline/` | **Sự kiện đã xảy ra trong bản thảo** (có `source_chapter`) | Theo nhiệm vụ |
| `content/canon/knowledge/` | **Kiến thức của từng nhân vật tại từng thời điểm** | Theo nhiệm vụ |
| `content/outlines/` | **Kế hoạch** — chưa xảy ra, có thể đổi | Theo nhiệm vụ |
| `content/summaries/<chapter_id>.md` | **Tóm tắt dẫn xuất**, ghi `source_blob` của chương nguồn | Agent được tạo/cập nhật |
| `content/reviews/` | Ghi chú review, báo cáo continuity | Agent được tạo |

`id` của chương **không bao giờ thay đổi** — kể cả khi đổi tên hay chuyển Act. Không đổi tên file chương.
Số chương hiển thị (Ch 10, Ch 11…) được tính từ `order` của các chương **ngoài Act 0**, không lưu trong file.
Ghi chú trong Act 0 không có số chương; chúng là tài liệu tham khảo, không phải sự kiện đã xảy ra trong truyện.

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
- **Kế hoạch** (ghi chú outline trong Act 0, hoặc `content/outlines` ở kho cũ): dự định, chưa phải sự thật.
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

## 8. Khi bản thảo nằm trên Cloudflare (không có repo git)

Bộ truyện trên Cloudflare không có repo git để clone. Agent đọc và đề xuất qua API của
trang, bằng **token agent** do tác giả cấp riêng (nằm trong biến môi trường, không bao giờ
ghi vào file hay chat):

```
Authorization: Bearer nbagent_…
```

(Khi trang còn bật Cloudflare Access, dùng service token: `CF-Access-Client-Id` /
`CF-Access-Client-Secret`.) Tài khoản Google của người đọc **không** dùng được các API dưới đây —
người đọc chỉ có chế độ đọc.

Quy tắc ở các mục 2–7 vẫn giữ nguyên. Các thao tác dành cho agent:

| Việc | Gọi |
|---|---|
| Danh sách bộ truyện | `GET /api/novels` |
| Chỉ mục chương, Act (không có nội dung) | `GET /api/novels/<id>/project` |
| Đọc một chương | `GET /api/novels/<id>/chapters/<chapter_id>` (thêm `?commit=<sha>` để đọc phiên bản cũ) |
| Đọc file bất kỳ (canon, outline…) | `GET /api/novels/<id>/file?path=content/...` |
| Liệt kê file trong một thư mục | `GET /api/novels/<id>/files?prefix=content/canon/` |
| Lịch sử | `GET /api/novels/<id>/history` |
| Ảnh của chương | `GET /api/novels/<id>/assets?chapter=<chapter_id>` |
| **Mở đề xuất** | `POST /api/novels/<id>/agent/proposals` |
| Bình luận vào đề xuất | `POST /api/novels/<id>/proposals/<n>/comment` `{"body": "..."}` |

Mở đề xuất: gửi **nội dung đầy đủ** của từng file đã sửa (cả frontmatter), không gửi diff.
`baseCommit` là commit bạn đã đọc (lấy từ `headSha` của `/project`); ứng dụng sẽ báo xung đột
nếu bản chính đã sửa cùng file.

```json
{
  "title": "Continuity Ch 12: …",
  "body": "Mục đích… Chương bị ảnh hưởng… Đã đọc… Thay đổi canon…",
  "baseCommit": "<headSha>",
  "changes": { "content/chapters/ch_xxxxxxxxxx.md": "---\nid: …\n---\nNội dung…\n" }
}
```

Agent **không** thể lưu thẳng vào bản chính, nhập đề xuất hay xóa ảnh. Tác giả duyệt và
nhập đề xuất trên trang.

## 9. Quy ước văn phong (cho chương mới)

Áp dụng cho chương viết từ Ch 13 trở đi. **Không viết lại Ch 1–12** vì mục này; chỉ sửa lỗi cơ học (chính tả, câu trùng, mâu thuẫn chi tiết). Tác giả sẽ hiệu chỉnh giọng văn Act 1 một lượt sau Ch 25.

- **Giọng chuẩn:** như Ch 13–15. Tiết chế, nhiều ẩn ý, câu ngắn, thoại mang nghĩa phụ. Ưu tiên chi tiết cụ thể hơn chuỗi tính từ nhấn mạnh (“mị hoặc”, “kinh hoàng”, “tuyệt đối”).
- **Cách gọi nhân vật trong lời kể:** Dan = “hắn”, Anki = “cậu ta”, Puna = “anh ta”, Sali = “cậu ta”, Zen = “cậu”. Chỉ dùng “gã” cho người ngoài đội hoặc phản diện.
- **Xưng hô trong thoại:** Anki gọi Zen “nhóc”; Puna xưng “tao/mày”, gọi Zen “nhóc con”; Sali xưng “tớ/cậu”; Dan gọi Zen “cậu”; Zen gọi “anh Dan”, “anh Puna”, gọi Anki là “cậu”.
- **Biệt danh “tiểu Supporter”:** Dan (và Sali khi trêu) dùng 1–2 lần mỗi chương, ở khoảnh khắc trêu hoặc dịu dàng. Không dùng ở cao trào cảm xúc nặng.
- **Không phá vách ngăn thứ tư:** lời kể không nhắc “chương sau”, không dùng thuật ngữ làm truyện (chemistry, arc, foreshadow), không nói trước tương lai ngoài hiểu biết của nhân vật.
- **Định dạng:** tiêu đề cảnh dạng `### **Tên Cảnh**`; chỉ in nghiêng cho suy nghĩ, tiếng động và lệnh phép (*Kết nối!*, *BOONG!*), không in nghiêng cả đoạn; không để lại ký tự `\!`.

## 10. Rà soát câu từ và chính tả trước khi gửi

Mọi chương mới hoặc đoạn sửa phải qua lượt rà này **trước khi** gửi đề xuất. Lỗi kỳ quặc thường không phải sai chính tả mà là thiếu chữ, ẩn dụ khó hiểu, câu có hai nghĩa hoặc chi tiết tự mâu thuẫn.

1. **Đọc lại toàn văn bản định gửi**, từng câu một, như một người chưa biết truyện. Không đọc “bản trong đầu”. Sau khi sửa, đọc lại cả đoạn quanh chỗ sửa.
2. **Thiếu chữ:** soát giới từ, chủ ngữ, động từ (ví dụ “gã Nagareen hôm hẻm sương” thiếu “ở”). Câu nào đọc lên vấp thì viết lại.
3. **Ẩn dụ và hình ảnh:** phải diễn đạt lại được bằng một câu nghĩa đen. Nếu người đọc phải đoán thì viết thẳng. Không dùng ẩn dụ trong thông tin quan trọng hoặc lời báo cáo (ví dụ “bước vào hình của chính mình” thay cho “mặt cậu đã nằm sẵn trong quả cầu”).
4. **Từ hai nghĩa:** thận trọng với “đủ”, “chịu”, “được”, “đổi lấy”… khi nghĩa có thể bị đảo. Có điều kiện thì viết rõ “chỉ cần”.
5. **Đếm và đối chiếu trong chương:** bao nhiêu người, ai đứng đâu, ai biết gì lúc nào, đồ vật nào có mặt (áo choàng đã “biến mất” thì đừng tả lại là đang mặc). “Cả bốn người nhìn sang Anki” là sai nếu Anki là một trong bốn.
6. **Chiều của sự đổi chác:** với “đổi”, “bỏ”, “mất”, “được”, kiểm tra ai mất, ai được.
7. **Soát cơ học:** chính tả và dấu thanh, từ lặp liền nhau, đoạn trùng, tên nhân vật xuất hiện trước khi giới thiệu, in nghiêng lệch, khoảng trắng thừa, ký tự `\!`.
8. **Đối chiếu chương trước:** mọi chi tiết lấy từ chương cũ phải đọc lại đúng đoạn đó, không dựa vào trí nhớ.
9. **Ghi trong mô tả đề xuất:** đã rà theo mục này, kèm danh sách chương/đoạn đã đọc.
