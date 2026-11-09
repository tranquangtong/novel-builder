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

## 3. QC: đúng 2 vòng

Theo quy trình chung trong `CLAUDE.md`, mục "Quy trình QC nội dung truyện": **QC vòng 1 → sửa → QC vòng 2 → sửa → báo cáo**. Không có QC vòng 3.

1. **QC vòng 1.** Gọi agent `novel-qc` với `<dir>`, danh sách file trong `<dir>/drafts/`, và ghi rõ "vòng 1/2". Chờ báo cáo.
2. **Sửa lần 1.** Gửi **nguyên văn** báo cáo cho `novel-writer`, yêu cầu sửa. Dùng SendMessage tới agent vừa chạy nếu được; nếu không, gọi agent mới và đưa kèm `<dir>`.
3. **QC vòng 2, vòng cuối.** Gọi lại `novel-qc` với ghi chú "vòng 2/2". Kèm danh sách mục vòng 1 cần kiểm, để agent xác nhận các mục đó đã sửa và tìm lỗi mới do việc sửa gây ra.
4. **Sửa lần 2.** Gửi nguyên văn báo cáo vòng 2 cho `novel-writer`. Không gọi QC lần nữa. Người điều phối tự kiểm từng chỗ đã sửa: đọc đoạn quanh chỗ sửa, chạy `wc` và grep.
5. Sau lần sửa 2, nếu một mục **Chặn** không sửa được, hoặc cách sửa cần tác giả quyết: **không** mở đề xuất. Báo tác giả các mục còn tồn đọng.

Nếu vòng 1 đã ĐẠT và không còn mục Nhẹ nào đáng sửa, bỏ qua các bước 2–4 ở trên và sang thẳng mục 4 (Mở đề xuất).

Tự kiểm lại lần cuối trước khi gửi: chạy `python3 .claude/novel/nb.py wc <dir>/drafts/*.md` và `grep -n -i -E 'supporter (elf|nagareen|yêu quái|vampire|người sói)' <dir>/drafts/*.md` (phải không ra gì).

## 4. Mở đề xuất

Viết `<dir>/body.md` theo mục 4 và mục 10 của `templates/manuscript/AGENTS.md`:
- Mục đích; danh sách chương (Ch số · tiêu đề · `id`) và số chữ.
- Tóm tắt từng chương.
- Đến chương cuối, outline của Act đã đi tới mục nào; chương thân mật nào đã có trong Act.
- Chi tiết canon mới cần tác giả duyệt (lấy từ báo cáo writer và QC).
- Kết quả QC: 2 vòng; các lỗi đáng chú ý đã sửa; những chỗ sửa sau vòng 2 không được QC lại, chỉ người điều phối tự kiểm.
- Các chương/ghi chú đã đọc.

Rồi chạy:
```bash
python3 .claude/novel/nb.py propose --title "Bản nháp Ch X–Y (Act N)" --body-file <dir>/body.md <dir>/drafts/*.md
```
Nếu có ghi chú Act 0 được sửa trong `<dir>/drafts/notes/`, thêm từng file dạng `content/chapters/<id ghi chú>.md=<dir>/drafts/notes/<file>`, hoặc mở một đề xuất riêng cho ghi chú nếu tác giả muốn duyệt tách.

## 5. Báo tác giả

Báo bằng tiếng Việt, ngắn: số đề xuất, bảng chương (số, tiêu đề, một dòng nội dung), outline đã đi tới đâu, chi tiết mới cần duyệt, và những gì QC đã bắt được. Nhắc tác giả rằng chỉ tác giả mới nhập được đề xuất trên trang.
