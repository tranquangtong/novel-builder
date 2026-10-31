import { createHash } from "node:crypto";

/** Tính git blob sha giống hệt `git hash-object` — dùng chung cho chế độ demo và GitHub. */
export function gitBlobSha(content: string): string {
  const buf = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}
