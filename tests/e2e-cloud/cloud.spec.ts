import { expect, test, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { MemoryStorage, MiniGit } from "../../src/lib/store/demo/minigit";
import { seedDemo } from "../../src/lib/store/demo/seed";
import { fakeGitHub, FAKE_TOKEN } from "../support/fake-github";

/** PNG 2×2 hợp lệ (để trình duyệt giải mã được). */
function png(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function createNovel(page: Page, title: string) {
  // chưa chọn bộ nào → về trang Bộ truyện
  await page.goto("/");
  await expect(page).toHaveURL(/\/novels\/$/);
  await expect(page.getByRole("heading", { name: "Tất cả bộ truyện" })).toBeVisible();
  await page.getByTestId("new-novel-title").fill(title);
  await page.getByTestId("create-novel").click();
  await expect(page).not.toHaveURL(/\/novels\/$/);
  await expect(page.locator("h1")).toHaveText(title);
}

test("tạo bộ truyện, viết tiếng Việt, lưu lên Cloudflare, reload vẫn còn", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await createNovel(page, "Bộ thử Cloudflare");
  await page.goto("/library/");
  await page.getByRole("button", { name: "+ Chương mới" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Chương đầu trên R2");
  await page.getByRole("button", { name: "Tạo chương" }).click();
  await expect(page.getByTestId("chapter-title")).toHaveValue("Chương đầu trên R2");
  await page.getByTestId("editor-content").click();
  await page.keyboard.insertText("Đêm ấy, Puna thức trắng — “Ừ,” Rei đáp khẽ.");
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
  await expect(page.getByTestId("save-state")).toContainText("trên Cloudflare");
  await page.reload();
  await expect(page.getByTestId("editor-content")).toContainText("“Ừ,” Rei đáp khẽ.");
  await expect(page.getByTestId("draft-restored")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ảnh của chương: tải lên R2, chèn vào chương, hiển thị khi đọc", async ({ page }) => {
  await createNovel(page, "Bộ có ảnh");
  await page.goto("/library/");
  await page.getByRole("button", { name: "+ Chương mới" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Chương có ảnh");
  await page.getByRole("button", { name: "Tạo chương" }).click();
  await expect(page.getByTestId("chapter-title")).toHaveValue("Chương có ảnh");
  await page.getByTestId("goto-gallery").click();
  await expect(page.getByTestId("chapter-gallery")).toBeInViewport();
  await page.getByLabel("Loại ảnh").selectOption("character");
  await page.getByPlaceholder("Chú thích (tuỳ chọn)").fill("Phác thảo Zen");
  await page.getByTestId("image-upload").setInputFiles({ name: "zen sketch.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByTestId("image-list")).toContainText("Phác thảo Zen");
  await expect(page.getByTestId("image-list")).toContainText("Nhân vật");
  await page.getByLabel("Loại ảnh").selectOption("scenery");
  await page.getByPlaceholder("Chú thích (tuỳ chọn)").fill("Đáy Sắt");
  await page.getByTestId("image-upload").setInputFiles({ name: "day-sat.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByTestId("image-filter")).toContainText("Cảnh quan (1)");
  await page.getByTestId("image-filter").getByRole("button", { name: "Nhân vật (1)" }).click();
  await expect(page.getByTestId("image-list").locator("figure")).toHaveCount(1);
  const thumb = page.getByTestId("image-list").locator("img").first();
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2);
  await page.getByRole("button", { name: "Chèn vào chương" }).click();
  await expect(page.getByTestId("editor-content")).toContainText("![Phác thảo Zen](asset:");
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
  await page.getByTestId("mode-read").click();
  const img = page.getByTestId("read-view").locator("img");
  await expect(img).toHaveAttribute("alt", "Phác thảo Zen");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2);
});

test("agent mở đề xuất qua API, tác giả xem diff và nhập trên trang", async ({ page }) => {
  await createNovel(page, "Bộ cho agent");
  const novelId = await page.evaluate(() => JSON.parse(localStorage.getItem("nb-connection")!).novelId as string);
  const r = await page.evaluate(async (nid) => {
    const p = await (await fetch(`/api/novels/${nid}/project`)).json();
    const act = p.acts[0].id;
    const res = await fetch(`/api/novels/${nid}/agent/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Agent: viết nháp Ch 1",
        body: "Mục đích: thử luồng agent trên Cloudflare.",
        changes: { "content/chapters/ch_agent0001.md": `---\nid: ch_agent0001\ntitle: Chương của agent\nact_id: ${act}\norder: 1\nstatus: draft\n---\nAgent viết câu này.\n` },
      }),
    });
    return { status: res.status, body: await res.json() };
  }, novelId);
  expect(r.status).toBe(200);
  await page.goto(`/proposal/?n=${r.body.number}`);
  await expect(page.getByTestId("proposal-file").first()).toContainText("Chương của agent");
  await expect(page.getByTestId("diff-inline")).toContainText("Agent viết câu này.");
  await page.getByTestId("accept").click();
  await page.getByTestId("confirm-accept").click();
  await expect(page.getByTestId("proposal-state")).toContainText("Đã nhập");
  await page.goto("/library/");
  await expect(page.getByTestId("chapter-tree")).toContainText("Chương của agent");
});

test("chuyển bộ truyện từ repo GitHub (API giả) sang Cloudflare, 200 chương, nhiều bộ tách biệt", async ({ page }) => {
  const git = new MiniGit(new MemoryStorage());
  await seedDemo(git);
  const fake = fakeGitHub(git, { owner: "o", repo: "r" });
  await page.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, x-github-api-version", "access-control-allow-methods": "GET, POST, PATCH, PUT" } });
    const res = await fake.handle(req.method(), new URL(req.url()), req.postData() ? JSON.parse(req.postData()!) : undefined, req.headers()["authorization"] ?? "");
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  await page.goto("/novels/");
  await page.getByText("Chuyển một bộ truyện từ repo GitHub sang Cloudflare").click();
  await page.getByLabel("Repo", { exact: true }).fill("o/r");
  await page.getByLabel("Token GitHub (chỉ cần quyền đọc)").fill(FAKE_TOKEN);
  await page.getByRole("button", { name: "Chuyển sang Cloudflare" }).click();
  // chuyển xong thì mở luôn bộ vừa chuyển
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
  await expect(page.locator("h1")).toHaveText("The Last Miracle");
  await page.goto("/novels/");
  await expect(page.getByTestId("cloud-novels").locator(".list-item", { hasText: "The Last Miracle" })).toContainText("200 chương");
  await page.goto("/library/");
  await expect(page.getByTestId("chapter-tree").locator(".tree-ch")).toHaveCount(200);
  // bộ khác vẫn tách biệt
  await page.getByTestId("switch-novel").click();
  await page.getByTestId("cloud-novels").locator(".list-item", { hasText: "Bộ thử Cloudflare" }).getByTestId("open-novel").click();
  await page.goto("/library/");
  await expect(page.getByTestId("chapter-tree").locator(".tree-ch")).toHaveCount(1);
});

test("nháp tự lưu lên R2: mở trên thiết bị khác (trình duyệt mới) vẫn thấy; menu gọn; đổi tên", async ({ page, browser }) => {
  await createNovel(page, "Bộ nháp R2");
  // menu chế độ Cloudflare: không còn mục GitHub/kết nối
  const nav = page.locator("nav.nav");
  await expect(nav).toContainText("Bộ truyện");
  await expect(nav).not.toContainText("Nhập & xuất");
  await expect(nav).not.toContainText("Gói tài liệu");
  await expect(nav).not.toContainText("kết nối");
  await page.goto("/settings/");
  await expect(page).toHaveURL(/\/novels\/$/);
  await page.goto("/library/");
  await expect(page.getByTestId("lib-import")).toBeVisible();
  await page.getByRole("button", { name: "+ Chương mới" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Chương nháp");
  await page.getByRole("button", { name: "Tạo chương" }).click();
  await expect(page.getByTestId("chapter-title")).toHaveValue("Chương nháp");
  const chapterUrl = page.url();
  await page.getByTestId("editor-content").click();
  await page.keyboard.insertText("Câu này chưa lưu phiên bản — chỉ là nháp.");
  await expect(page.getByTestId("save-state")).toContainText("Nháp đã tự lưu lên Cloudflare", { timeout: 15_000 });

  // "thiết bị khác": trình duyệt mới, không có IndexedDB/localStorage
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/novels/");
  await p2.getByTestId("cloud-novels").locator(".list-item", { hasText: "Bộ nháp R2" }).getByTestId("open-novel").click();
  await expect(p2).toHaveURL(/\/$/);
  await p2.goto(chapterUrl);
  await expect(p2.getByTestId("editor-content")).toContainText("Câu này chưa lưu phiên bản — chỉ là nháp.");
  await expect(p2.getByTestId("save-state")).toHaveAttribute("data-state", "local");
  await other.close();

  // lưu phiên bản thì nháp trên R2 bị xoá
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
  const novelId = await page.evaluate(() => JSON.parse(localStorage.getItem("nb-connection")!).novelId as string);
  const chId = new URL(chapterUrl).searchParams.get("id");
  await expect.poll(async () => page.evaluate(async ([n, c]) => (await (await fetch(`/api/novels/${n}/drafts/${c}`)).json()).draft, [novelId, chId])).toBeNull();

  // đổi tên bộ truyện
  await page.goto("/novels/");
  const row = page.getByTestId("cloud-novels").locator(".list-item", { hasText: "Bộ nháp R2" });
  await expect(row.getByTestId("novel-stats")).toContainText("1 chương");
  await row.getByRole("button", { name: "Đổi tên" }).click();
  await page.getByTestId("rename-input").fill("Bộ nháp R2 (mới)");
  await page.getByTestId("rename-input").press("Enter");
  await expect(page.getByTestId("cloud-novels")).toContainText("Bộ nháp R2 (mới)");
  await expect(page.locator(".brand-title")).toHaveText("Bộ nháp R2 (mới)");
});
