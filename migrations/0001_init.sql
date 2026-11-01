-- Danh sách bộ truyện. Nội dung (chương, phiên bản, ảnh) nằm ở R2, không ở đây.
CREATE TABLE IF NOT EXISTS novels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

-- “Phiên bản hiện tại” của mỗi bộ: các nhánh (main, agent/...) và đề xuất.
-- version tăng mỗi lần ghi để phát hiện ghi đồng thời (compare-and-swap).
CREATE TABLE IF NOT EXISTS repo_state (
  novel_id TEXT PRIMARY KEY REFERENCES novels(id),
  state TEXT NOT NULL,
  version INTEGER NOT NULL
);
