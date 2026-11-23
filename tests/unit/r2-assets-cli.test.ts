import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "scripts/r2-assets.mjs", ...args], {
    encoding: "utf8", timeout: 5_000,
  });
}

const upload = ["upload", "--scope", "ch_abc123", "--kind", "sketch", "--actor", "tac-gia@example.com"];
let fixtures: string;
beforeEach(() => { fixtures = mkdtempSync(join(tmpdir(), "nb-assets-test-")); });
afterEach(() => { rmSync(fixtures, { recursive: true, force: true }); });

describe("R2 assets CLI", () => {
  it("previews uploads with spaces, inferred captions and per-file overrides", () => {
    const first = join(fixtures, "Đáy Sắt.JPEG");
    const second = join(fixtures, "Ảnh Zen.png");
    writeFileSync(first, "abc");
    writeFileSync(second, "defg");
    const result = cli(...upload, "--caption-from-name", first, `${second}= Chú thích = Zen `);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dryRun: true, command: "upload", novel: "nv_bt8y37enbg",
      objects: [
        {
          path: first, key: expect.stringMatching(/^novels\/nv_bt8y37enbg\/assets\/ch_abc123\/[0-9a-z]+-[0-9a-f]{8}-Day-Sat\.jpg$/),
          size: 3, httpMetadata: { contentType: "image/jpeg" },
          customMetadata: { caption: encodeURIComponent("Đáy Sắt"), fileName: encodeURIComponent("Đáy Sắt.JPEG"), kind: "sketch", uploadedBy: "tac-gia@example.com" },
        },
        {
          path: second, size: 4, httpMetadata: { contentType: "image/png" },
          customMetadata: { caption: encodeURIComponent("Chú thích = Zen") },
        },
      ],
    });
  });

  it("validates extension, empty files and the 15 MiB size boundary", () => {
    const file = join(fixtures, "anh.png");
    writeFileSync(file, "");
    expect(cli(...upload, file)).toMatchObject({ status: 1, stderr: expect.stringContaining("Tệp rỗng") });
    truncateSync(file, 15 * 1024 * 1024);
    expect(cli(...upload, file).status).toBe(0);
    truncateSync(file, 15 * 1024 * 1024 + 1);
    expect(cli(...upload, file)).toMatchObject({ status: 1, stderr: expect.stringContaining("Ảnh quá lớn") });
    expect(cli(...upload, join(fixtures, "anh.svg"))).toMatchObject({ status: 1, stderr: expect.stringContaining("Chỉ nhận ảnh") });
  });

  it("previews scoped lists and trash moves and validates selectors", () => {
    const rel = "chung/m0k-1234abcd-anh.png";
    const list = cli("list", "--novel", "nv_123456", "--scope", "chung");
    expect(list.status).toBe(0);
    expect(JSON.parse(list.stdout)).toMatchObject({ dryRun: true, command: "list", prefix: "novels/nv_123456/assets/chung/" });
    const trash = cli("trash", "--actor", "tac-gia@example.com", rel);
    expect(trash.status).toBe(0);
    expect(JSON.parse(trash.stdout)).toMatchObject({
      dryRun: true, command: "trash", operations: ["copy", "delete"], deletedBy: "tac-gia@example.com",
      objects: [{ key: `novels/nv_bt8y37enbg/assets/${rel}`, destination: `novels/nv_bt8y37enbg/trash/${rel}` }],
    });
    expect(cli("trash", "--actor", "tac-gia@example.com", "../objects/example").status).toBe(1);
    expect(cli("list", "--scope", "ch_ab").status).toBe(1);
    expect(cli("list", "--novel", "../other").status).toBe(1);
    expect(cli("upload", "--scope", "chung", "--kind", "cover", "--actor", "tac-gia@example.com", "anh.png").status).toBe(1);
  });
});
