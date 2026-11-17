# Ảnh tham chiếu — The Last Miracle

Ảnh dùng làm mẫu tạo hình nhân vật và phối cảnh. Chỉ dành cho truyện này; truyện khác tạo thư mục riêng dưới `stories/<ten-truyen>/art/`.

Ảnh được lưu bằng Git LFS (xem `.gitattributes` ở gốc repo).

## Thư mục

| Thư mục | Nội dung |
|---|---|
| `characters/` | Bảng nhân vật (character sheet). Đây là **ảnh gốc chuẩn**: luôn đính kèm khi gen ảnh có nhân vật đó. |
| `scenes/` | Phối cảnh theo chương. Đặt tên `chNN <tên cảnh>`. |
| `posters/` | Poster, ảnh bìa. |
| `generated/` | Ảnh mới gen từ board, chờ duyệt. Ảnh đạt thì chuyển sang thư mục tương ứng. |

## Danh sách hiện có

**Nhân vật:** Anki, Dan (thường, chế độ chiến đấu), Puna, Sali (thường, jade mana), Zen.

**Cảnh:** ch1 Anki đấu Bò Sừng; ch1 Sợi chỉ ẩn trong Hố Sắt (2 bản); ch3 Phép tím và sư tử đá; ch10 Zen x Dan; Zen x Dan 1–2.

**Poster:** ch0 poster (3 bản).

## Quy ước khi gen ảnh mới

1. Mỗi lần gen, đính kèm bảng nhân vật trong `characters/` của **mọi** nhân vật xuất hiện, cộng một ảnh cảnh làm mẫu phong cách.
2. Sửa chi tiết nhỏ bằng tô vùng (inpaint), không gen lại cả ảnh.
3. Ảnh mới được duyệt mới đưa vào `characters/` hoặc `scenes/`. Không dùng ảnh lỗi làm mẫu.
