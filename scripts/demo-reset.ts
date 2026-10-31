/** Xóa dữ liệu demo; lần truy cập tiếp theo sẽ tạo lại 200 chương demo. */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.env.DEMO_DATA_DIR || ".demo-data");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Đã xóa ${dir}`);
