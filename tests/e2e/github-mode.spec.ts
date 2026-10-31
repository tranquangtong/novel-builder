import { expect, test, type Page } from "@playwright/test";
import { MemoryStorage, MiniGit } from "../../src/lib/store/demo/minigit";
import { seedDemo } from "../../src/lib/store/demo/seed";
import { fakeGitHub, FAKE_TOKEN } from "../support/fake-github";
import { B, go, typeAtEnd } from "./helpers";

/**
 * Chế độ GitHub trên trang tĩnh: trình duyệt gọi thẳng https://api.github.com.
 * Ở đây mọi request tới api.github.com được chặn và trả lời bằng GitHub API GIẢ
 * (tests/support/fake-github.ts). Không thay thế việc kiểm thử với GitHub thật.
 */
async function setup(page: Page, opts: { private?: boolean } = {}) {
  const git = new MiniGit(new MemoryStorage());
  const seed = await seedDemo(git);
  const fake = fakeGitHub(git, { owner: "o", repo: "r", private: opts.private });
  const external: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith("http://localhost") && !u.startsWith("https://api.github.com/")) external.push(u);
  });
  await page.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, x-github-api-version", "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE" } });
    }
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
    const res = await fake.handle(req.method(), new URL(req.url()), body, req.headers()["authorization"] ?? "");
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  return { git, seed, fake, external };
}

async function connect(page: Page, token = FAKE_TOKEN) {
  await go(page, "/settings/");
  await page.getByTestId("conn-repo").fill("o/r");
  await page.getByTestId("conn-token").fill(token);
  await page.getByTestId("conn-submit").click();
}

test("kết nối bằng token; 200 chương không tải toàn bộ nội dung; token chỉ tới api.github.com", async ({ page }) => {
  const { fake, seed, external } = await setup(page);
  await connect(page);
  await expect(page.getByTestId("diagnose-result")).toContainText("Repository là private");
  await expect(page.getByTestId("diagnose-result").locator("text=✗")).toHaveCount(0);
  // không “ghi nhớ” → token chỉ trong sessionStorage
  expect(await page.evaluate(() => localStorage.getItem("nb-connection"))).toBeNull();

  await go(page, "/library/");
  await expect(page.getByTestId("chapter-tree").locator(".tree-ch")).toHaveCount(200);
  const blobReads = () => fake.calls.filter((c) => c.path.includes("/git/blobs/")).map((c) => c.path);
  // project.json + index.json + 4 Act — không đọc thân chương nào
  expect(new Set(blobReads()).size).toBeLessThanOrEqual(6);
  const before = new Set(blobReads());
  for (const n of [1, 100, 200]) {
    await page.getByTestId("chapter-tree").locator(".tree-ch").nth(n - 1).click();
    await expect(page).toHaveURL(new RegExp(`/chapter/\\?id=${seed.chapterIds[n - 1]}$`));
    await expect(page.getByTestId("chapter-title")).not.toHaveValue("");
  }
  const newBlobs = [...new Set(blobReads())].filter((p) => !before.has(p));
  expect(newBlobs).toHaveLength(3);

  expect(fake.calls.every((c) => c.auth === `token ${FAKE_TOKEN}`)).toBe(true);
  expect(external).toEqual([]);
});

test("token sai → không kết nối", async ({ page }) => {
  await setup(page);
  await connect(page, "github_pat_sai");
  await expect(page.getByText(/Không kết nối được/)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("nb-connection") ?? localStorage.getItem("nb-connection"))).toBeNull();
});

test("repo public → cảnh báo rõ", async ({ page }) => {
  await setup(page, { private: false });
  await connect(page);
  await expect(page.getByTestId("diagnose-result")).toContainText("ĐANG PUBLIC");
});

test("lưu tiếng Việt lên GitHub; lưu thất bại giữ nháp; agent sửa từ bên ngoài bị phát hiện", async ({ page }) => {
  const { fake, git, seed } = await setup(page);
  await connect(page);
  await expect(page.getByTestId("diagnose-result")).toBeVisible();
  const id = seed.chapterIds[4];
  await go(page, `/chapter/?id=${id}`);
  await expect(page.getByTestId("chapter-title")).not.toHaveValue("");

  // 1) lưu thất bại
  await typeAtEnd(page, "\n\nĐêm ấy, Puna thức trắng — “Ừ,” Rei đáp khẽ.");
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
  fake.failNext("POST", /\/git\/commits$/, 502, "Server Error");
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "error");
  await expect(page.getByTestId("save-state")).toContainText("Nháp vẫn an toàn");
  await expect(page.getByText(/Đã lưu phiên bản/)).toHaveCount(0);

  // 2) reload → nháp còn
  await page.reload();
  await expect(page.getByTestId("draft-restored")).toBeVisible();

  // 3) lưu lại thành công → commit thật trên “GitHub”
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
  await expect(page.getByTestId("save-state")).toContainText("lên GitHub");
  const head = (await git.readState()).refs.main;
  const c = await git.readCommit(head);
  expect(await git.readBlob(c.tree[`content/chapters/${id}.md`])).toContain("“Ừ,” Rei đáp khẽ.");
  const writes = fake.calls.filter((x) => x.method !== "GET").map((x) => `${x.method} ${x.path.replace(/[0-9a-f]{40}/, "")}`);
  expect(writes.filter((w) => w.startsWith("PATCH"))).toEqual(["PATCH /repos/o/r/git/refs/heads/main"]);

  // 4) agent sửa cùng chương trực tiếp trên GitHub trong lúc tác giả đang có nháp
  await typeAtEnd(page, "\n\nNháp tiếp theo.");
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
  const s = await git.readState();
  const parent = await git.readCommit(s.refs.main);
  const ext = await git.writeCommit({ tree: { ...parent.tree, [`content/chapters/${id}.md`]: await git.writeBlob((await git.readBlob(parent.tree[`content/chapters/${id}.md`])) + "\nAgent sửa.\n") }, parents: [parent.sha], message: "agent", author: "claude", date: new Date().toISOString() });
  s.refs.main = ext.sha;
  await git.writeState(s);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("conflict-banner")).toBeVisible();
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "error");
  // GitHub không bị ghi đè
  expect((await git.readState()).refs.main).toBe(ext.sha);
});

test("trang dưới basePath /novel-builder hoạt động khi vào thẳng URL con", async ({ page }) => {
  await setup(page);
  await connect(page);
  await expect(page.getByTestId("diagnose-result")).toBeVisible();
  await page.goto(`${B}/history/`);
  await expect(page.getByTestId("commit-list").locator(".list-item").first()).toBeVisible();
});
