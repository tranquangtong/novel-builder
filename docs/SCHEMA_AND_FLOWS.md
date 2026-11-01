# Schema bản thảo và các luồng lưu / duyệt / phục hồi

## 1. Bố cục repo bản thảo

```
AGENTS.md                         quy tắc cho agent (mẫu: templates/manuscript/AGENTS.md)
content/
  project.json                    { title, subtitle?, language, word_target: {min, max}, demo_data? }
  index.json                      CHỈ MỤC TỰ SINH — không sửa tay
  acts/<act_id>.md                frontmatter: id, title, order; thân: mô tả
                                  Act 0 · Outline & Trivia có thêm `kind: notes`, order 0
  chapters/<chapter_id>.md        một chương / một file. Chương có act_id = Act 0 là GHI CHÚ
                                  (outline, trivia, thiết lập nhân vật): không đánh số, không tính
                                  vào số chữ/mục tiêu, không xuất; có thể kèm note_kind, migrated_from
  (kiểu cũ — trang có nút “Chuyển vào Act 0”, sau đó các thư mục này trống)
  canon/characters/*.md           canon đã chốt (status: canon | proposed)
  canon/world/*.md                canon đã chốt về thế giới, vật phẩm, địa danh
  canon/timeline/*.md             sự kiện ĐÃ xảy ra trong bản thảo (events[].source_chapter)
  canon/knowledge/*.md            kiến thức nhân vật (entries[].state: knows|suspects|unaware|misbelieves)
  outlines/*.md                   kế hoạch (status: planned)
  summaries/<chapter_id>.md       tóm tắt dẫn xuất (chapter_id, source_blob, source_commit)
  reviews/*.md                    báo cáo của agent
  notes/<chapter_id>.md           ghi chú tác giả theo chương (panel "Ghi chú")
```

### File chương

```markdown
---
id: ch_8s05ap5zxz
title: Sương phía bắc
act_id: act_8ttdm01wf5
order: 10
status: in_review        # draft | in_review | approved
pov: Puna                # không bắt buộc
---
Mưa không ngừng suốt buổi sáng…
```

- **`id` ổn định**: tạo ngẫu nhiên (`ch_` + 10 ký tự base32) một lần duy nhất. Đường dẫn file dựa trên `id`, nên **đổi tên hay chuyển Act không làm đổi ID hay đường dẫn**, và lịch sử của file liền mạch.
- **`order`** là khóa sắp xếp trên toàn bản thảo (có thể là số thập phân để chèn giữa hai chương). **Số chương hiển thị** (Ch 10) được tính từ thứ tự và không lưu trong file.
- Thân chương được giữ **nguyên từng ký tự** khi đọc/ghi. Các khóa frontmatter lạ (do agent hay công cụ khác thêm) được giữ nguyên khi lưu.
- **Đếm chữ**: chỉ đếm thân chương (không gồm frontmatter/tiêu đề), tách theo khoảng trắng Unicode, chỉ tính cụm có ít nhất một chữ cái/chữ số, bỏ comment HTML và ảnh chèn `![…](…)`. Tiếng Việt: mỗi âm tiết là một chữ.

### `content/index.json`

Dữ liệu dẫn xuất để mở danh sách 200+ chương bằng **một** lần đọc. Mỗi chương một dòng (giúp git merge):

```json
{"id":"ch_…","path":"content/chapters/ch_….md","blob":"<git blob sha của file>","title":"…","act_id":"act_…","order":10,"status":"draft","pov":"Puna","words":2734}
```

Khi tải danh sách, trang so `blob` trong chỉ mục với blob thực trong cây thư mục (1 request). Chỉ những chương lệch (ví dụ agent vừa sửa) mới được đọc trực tiếp. Mỗi lần ứng dụng ghi, chỉ mục được sinh lại **trong cùng commit**.

### Tóm tắt dẫn xuất

`source_blob` là git blob sha của file chương lúc tóm tắt. Nếu blob hiện tại khác thì tóm tắt **đã cũ**: trang Gói tài liệu đánh dấu "đã cũ".

## 2. Cache và nháp: phân biệt rõ

| | Nằm ở đâu | Là gì |
|---|---|---|
| **Phiên bản đã lưu** | Repo (GitHub hoặc kho demo) | Nguồn chính. Mỗi lần "Lưu phiên bản" là một commit |
| **Nháp** | IndexedDB của trình duyệt (`nb-studio/drafts`) | Chỉ trên thiết bị này. Khóa `<repoKey>::<chapterId>`, ghi kèm `baseBlob` + `baseCommit` (phiên bản gốc) |
| **Nháp trên R2** (chỉ chế độ Cloudflare) | `novels/<id>/drafts/<chapterId>.json` | Bản sao nháp mới nhất, đẩy lên sau ~2,5 giây ngừng gõ (và khi đóng tab). Mở ở máy khác thì bản mới hơn thắng; thiết bị khác ghi bản cũ hơn bị từ chối (409). Xoá khi đã lưu phiên bản (chỉ nếu không có nháp mới hơn) |
| **Cache** | Bộ nhớ của tab (LRU) | Chỉ dữ liệu bất biến khóa theo sha (cây, blob, chương đã parse). Mất đi cũng không sao |
| **Token GitHub** | sessionStorage (hoặc localStorage nếu “Ghi nhớ”) | Chỉ gửi tới api.github.com |

Không có database nào lưu toàn văn chương.

## 3. Luồng viết và lưu

1. Mở chương: tải **một** file từ GitHub, rồi tìm nháp trong IndexedDB.
   - Có nháp và nháp dựa trên đúng phiên bản hiện tại: khôi phục và báo "Đã khôi phục nháp chưa lưu".
   - Có nháp nhưng phiên bản gốc đã cũ: vẫn khôi phục và **hiện cảnh báo xung đột**, chưa cho lưu cho tới khi người dùng chọn cách xử lý.
2. Gõ: sau 400 ms nháp được ghi vào IndexedDB, và cả khi tab bị ẩn hoặc đóng. Thanh trạng thái hiện **"Nháp chỉ có trên thiết bị này · chưa lưu phiên bản"**.
3. **Lưu phiên bản** (nút hoặc Ctrl/⌘+S, có thể kèm ghi chú): gửi `{meta, body, baseBlob}` cho lớp nghiệp vụ trong trình duyệt.
   - Đọc head của nhánh trên GitHub. Nếu blob của chương ≠ `baseBlob` thì trả **409** kèm thông tin bản trên kho.
   - Tạo **một commit** gồm file chương và `content/index.json`, rồi cập nhật ref với `force:false`. Nếu nhánh vừa đi tiếp (do file khác) thì kiểm tra lại và thử lại tối đa 4 lần.
   - Thành công: xóa nháp **chỉ khi** nội dung nháp đúng bằng nội dung vừa lưu, rồi báo "Đã lưu phiên bản abc1234 lên GitHub".
   - Thất bại: giữ nháp và báo lỗi. Không bao giờ báo thành công.
4. Xử lý xung đột: **So sánh** (diff 3 phía: thay đổi bên ngoài và bản trên kho so với nháp) · **Giữ nội dung của tôi** (đổi phiên bản gốc sang bản mới nhất; lần lưu sau sẽ thay bản trên kho, thay đổi bên ngoài vẫn nằm trong lịch sử) · **Bỏ nháp, dùng bản trên kho** (có xác nhận, có nút tải nháp về trước).

### Phát hiện thay đổi từ bên ngoài

- Cứ 15 giây và mỗi khi cửa sổ được focus, editor hỏi GitHub blob hiện tại của chương. Nếu blob khác thì hiện cảnh báo, không ghi đè gì.
- **Nhiều tab**: các tab báo cho nhau qua `BroadcastChannel`. Mỗi lần ghi nháp đều kiểm tra trong một transaction IndexedDB: nếu tab khác đã ghi nháp mới hơn thì tab này **dừng tự lưu** và hỏi người dùng (so sánh / dùng nội dung tab kia / tiếp tục với tab này).

## 4. Luồng đề xuất (agent → review → nhập)

1. Agent làm trên nhánh riêng `agent/<việc>`, mở pull request vào `main` theo `AGENTS.md`.
2. Trang **Đề xuất chỉnh sửa** liệt kê PR mở có file trong `content/` hoặc `AGENTS.md`, kèm chương bị ảnh hưởng.
3. Trang chi tiết hiển thị:
   - Mô tả, danh sách file (chương trước, rồi canon, rồi các file khác).
   - Diff theo đoạn (ghép cặp đoạn sửa, tô từ thêm/xóa). Có các chế độ Song song, Trước (đọc), Sau (đọc). Thay đổi metadata (tiêu đề, Act, trạng thái, **ID bị đổi**) được nêu riêng.
   - Cờ "bản chính cũng đã sửa file này" và cảnh báo xung đột (`mergeable=false`).
4. **Chấp nhận toàn bộ** = merge: `PUT /pulls/:n/merge` với `sha = head mà tác giả đã xem`. Nếu agent đẩy thêm commit sau khi trang được mở, GitHub trả **409**, ứng dụng báo "Đề xuất đã thay đổi sau khi bạn mở review" và **không nhập**.
5. **Yêu cầu sửa** gửi review `REQUEST_CHANGES`. Nếu GitHub từ chối (tài khoản là tác giả PR) thì gửi thành bình luận và báo rõ.
6. **Approval chính thức** tách riêng với “Chấp nhận” và được gửi bằng tài khoản của token. GitHub ghi rõ *"Pull request authors cannot approve their own pull requests"* (github/docs, `data/reusables/repositories/request-changes-tips.md`). Nút này bị vô hiệu khi danh tính của ứng dụng chính là tác giả PR.

## 5. Phục hồi

- **Không rewrite lịch sử, không rollback cả repo.** Phục hồi tạo một **phiên bản mới**, trong đó các chương đã chọn mang nội dung cũ.
- Từ panel **Phiên bản** của chương, hoặc từ **Lịch sử**: chọn một phiên bản, ứng dụng liệt kê các chương khác với hiện tại, bạn chọn chương (ví dụ Ch 10 và Ch 11), xem trước diff rồi xác nhận.
- Mặc định chỉ phục hồi **nội dung**, giữ tiêu đề/Act/trạng thái hiện tại (có tùy chọn phục hồi cả metadata).
- Có kiểm tra phiên bản gốc: nếu chương bị sửa sau bước xem trước thì trả 409, không ghi gì.
- Ví dụ bắt buộc đã có test: trả Ch10–11 về bản cũ, Ch8–9 và canon giữ nguyên (`tests/unit/service.test.ts`, `tests/e2e/flows.spec.ts`).

## 6. Gói tài liệu cho nhiệm vụ

Trang **Gói tài liệu** tạo manifest gồm `repo`, `branch`, `commit`, `task`, `rules[]` và `files[]`. Mỗi file có `{role: target|neighbor|canon|knowledge|timeline|outline|summary, path, blob, label, words?, stale?}`. Manifest **không nhúng nội dung**: agent đọc đúng phiên bản bằng `git show <commit>:<path>`. Chỉ những chương được chọn và chương lân cận được đưa vào, không nạp cả 200 chương.

## 7. Nhập / xuất

- Nhập `.md`/`.txt`, phân tích **ở trình duyệt** để xem trước. Nhận diện được `Chương N: …`, `Chapter N – …`, `# Chương N`, `Act/Hồi/Phần/Quyển N`. Dòng bắt đầu bằng "Chương 3 …" nằm giữa đoạn văn thì không bị coi là tiêu đề.
- Thân chương giữ **nguyên văn**: chỉ bỏ dòng trống ở đầu/cuối chương và đổi CRLF thành LF. Văn bản dạng NFD được cảnh báo nhưng không bị sửa.
- Có cảnh báo cho: trùng số chương trong file, số chương đã có trong bản thảo (mặc định **bỏ qua**, ghi đè chỉ khi chọn rõ), ID trùng, thiếu tên, chương rỗng, nội dung trước chương đầu tiên (mặc định không nhập), số chương nhảy cóc.
- Toàn bộ lần nhập là **một commit**. Ghi đè dùng kiểm tra phiên bản gốc.
- Xuất: từng chương (nút “Xuất .md” trong editor) hoặc toàn bộ bản thảo (trang Nhập & xuất); tệp được tạo ngay trong trình duyệt.
- **Nguồn chính sau khi chuyển là repository.** Không có đồng bộ hai chiều với Google Docs.
