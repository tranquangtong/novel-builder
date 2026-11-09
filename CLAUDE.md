# Ghi chú cho Claude Code trong repo này

Repo này chứa mã nguồn trang Novel Builder, kèm công cụ để agent làm việc với bộ truyện "The Last Miracle". Bản thảo không nằm trong repo này. Bản thảo lưu trên trang (Cloudflare), đọc và gửi đề xuất qua `.claude/novel/nb.py`.

- Quy tắc agent: `templates/manuscript/AGENTS.md`.
- Bảng kiểm canon: `.claude/novel/canon-checklist.md`.
- Agent viết: `novel-writer`. Agent QC: `novel-qc`. Lệnh viết chương mới: `/drafting`.

## Quy trình QC nội dung truyện (bắt buộc)

Áp dụng cho `/drafting` và **mọi yêu cầu cập nhật nội dung truyện**: viết hay sửa chương, sửa thiết lập, sửa ghi chú Act 0 (outline, canon). Quy trình có đúng **2 vòng QC**:

1. **QC vòng 1.** Gọi `novel-qc`, ghi rõ "vòng 1/2".
2. **Sửa.** Sửa theo báo cáo vòng 1: giao `novel-writer`, hoặc tự sửa nếu là sửa nhỏ.
3. **QC vòng 2.** Gọi `novel-qc`, ghi rõ "vòng 2/2" và kèm danh sách mục vòng 1 cần kiểm.
4. **Sửa.** Sửa theo báo cáo vòng 2. **Không gọi QC vòng 3.** Người điều phối tự kiểm từng chỗ vừa sửa: đọc đoạn quanh chỗ sửa, chạy `python3 .claude/novel/nb.py wc` trên các file đã sửa, chạy grep cơ học.
5. **Báo cáo.** Gửi đề xuất lên trang, rồi báo tác giả. Báo cáo gồm:
   - những gì đã sửa;
   - những gì QC đã bắt;
   - những chỗ sửa sau vòng 2 không được QC lại;
   - các chi tiết cần tác giả quyết.

   Nếu sau bước 4 còn mục **Chặn** chưa sửa được, hoặc có chỗ cần tác giả quyết trước: **không** gửi đề xuất. Báo tác giả trước.

Nếu QC vòng 1 đã ĐẠT và không còn lỗi đáng sửa, bỏ qua bước 2–4 và đi thẳng tới báo cáo.
