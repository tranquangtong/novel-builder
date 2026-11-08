---
description: Viết tiếp chương mới cho "The Last Miracle" bằng hai agent novel-writer và novel-qc, rồi mở đề xuất trên Novel Builder.
argument-hint: <chương cần viết, ví dụ "41-45"> [ghi chú thêm cho người viết]
---

Yêu cầu của tác giả: $ARGUMENTS

Bạn điều phối hai agent `novel-writer` và `novel-qc` để viết các chương được yêu cầu, QC cho đến khi đạt, rồi mở **một** đề xuất trên Novel Builder. Làm lần lượt:

## 1. Chuẩn bị

- Chạy `python3 .claude/novel/nb.py project`. Nếu lỗi 401 hoặc 403, dừng lại và báo tác giả: token agent (`nbagent_…`) chưa có hoặc sai trong môi trường (xem `docs/FIREBASE_SETUP.md`, mục token cho agent).
- Chạy `python3 .claude/novel/nb.py proposals`. Nếu còn đề xuất đang mở đụng tới các chương sắp viết hoặc chương ngay trước, báo tác giả trước khi làm tiếp.
- Xác định số chương cần viết từ yêu cầu (nếu chỉ ghi "N chương tiếp", tính từ chương cuối hiện có), Act chứa các chương đó, và mục tương ứng trong `IV. Act Runs`. Nếu yêu cầu mơ hồ đến mức không biết viết chương nào, hỏi tác giả một câu rồi mới làm.
- Tạo thư mục làm việc `.drafts/<ngày>-<chương đầu>-<chương cuối>/` (đã có trong `.gitignore`), gọi là `<dir>`. Kéo nguồn: `python3 .claude/novel/nb.py pull <dir>/source --from <chương đầu - 5> --to <chương cuối hiện có>`.

## 2. Viết

Gọi agent `novel-writer` (chạy foreground, chờ kết quả). Đưa cho nó:
- `<dir>`, danh sách chương cần viết (số chương, Act, `act_id`), và mục outline tương ứng (chép nguyên văn từ ghi chú Act 0).
- Ghi chú thêm của tác giả trong `$ARGUMENTS`, nếu có.
- Nếu lô chương chứa chương thân mật nào của Act (xem bảng trong `IV. Act Runs`, các chương thân mật đã viết của Act đó, và mục 5 của bảng kiểm: chương nào tác giả đã duyệt, chương nào chưa đạt), ghi rõ chương nào và nhắc chuẩn trong bảng kiểm mục 5.
- Nhắc: lô lớn hơn 4 chương thì viết và tự kiểm từng chương một, không viết dồn.

## 3. QC

Gọi agent `novel-qc` với `<dir>` và danh sách file trong `<dir>/drafts/`. Chờ báo cáo.

- **CHƯA ĐẠT**: tiếp tục agent `novel-writer` (dùng SendMessage tới agent vừa chạy nếu có, nếu không thì gọi mới và đưa kèm `<dir>`) với **nguyên văn** báo cáo QC, yêu cầu sửa. Rồi gọi lại `novel-qc` trên bản đã sửa. Tối đa 3 vòng. Sau 3 vòng vẫn còn mục Chặn: **không** mở đề xuất; báo tác giả các mục còn tồn đọng.
- **ĐẠT**: sang bước 4.

Tự kiểm lại lần cuối trước khi gửi: chạy `python3 .claude/novel/nb.py wc <dir>/drafts/*.md` và `grep -n -i -E 'supporter (elf|nagareen|yêu quái|vampire|người sói)' <dir>/drafts/*.md` (phải không ra gì).

## 4. Mở đề xuất

Viết `<dir>/body.md` theo mục 4 và mục 10 của `templates/manuscript/AGENTS.md`:
- Mục đích; danh sách chương (Ch số · tiêu đề · `id`) và số chữ.
- Tóm tắt từng chương.
- Đến chương cuối, outline của Act đã đi tới mục nào; chương thân mật nào đã có trong Act.
- Chi tiết canon mới cần tác giả duyệt (lấy từ báo cáo writer và QC).
- Kết quả QC: số vòng, các lỗi đáng chú ý đã sửa.
- Các chương/ghi chú đã đọc.

Rồi chạy:
```bash
python3 .claude/novel/nb.py propose --title "Bản nháp Ch X–Y (Act N)" --body-file <dir>/body.md <dir>/drafts/*.md
```
Nếu có ghi chú Act 0 được sửa trong `<dir>/drafts/notes/`, thêm từng file dạng `content/chapters/<id ghi chú>.md=<dir>/drafts/notes/<file>`, hoặc mở một đề xuất riêng cho ghi chú nếu tác giả muốn duyệt tách.

## 5. Báo tác giả

Báo bằng tiếng Việt, ngắn: số đề xuất, bảng chương (số, tiêu đề, một dòng nội dung), outline đã đi tới đâu, chi tiết mới cần duyệt, và những gì QC đã bắt được. Nhắc tác giả rằng chỉ tác giả mới nhập được đề xuất trên trang.
