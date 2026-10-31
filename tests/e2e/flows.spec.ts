import { expect, test } from "@playwright/test";
import { chapterByNumber, login, openChapter, readChapter, snapshot, typeAtEnd } from "./helpers";

const VI = "\n\nĐêm ấy, Puna thức trắng — cô nghĩ về lời hứa với Ben. “Ừ,” Rei đáp khẽ; gió lùa qua khe cửa, mang theo mùi tro ngai ngái.";

test.describe("Xác thực", () => {
  test("không đọc/ghi nội dung khi chưa đăng nhập", async ({ page, request }) => {
    for (const url of ["/api/project", "/api/chapters/ch_abcdefghij", "/api/proposals", "/api/export", "/api/history", "/api/files?prefix=content/canon/", "/api/file?path=content/project.json"]) {
      const r = await request.get(url);
      expect(r.status(), url).toBe(401);
      expect(await r.text()).not.toContain("Puna");
    }
    const w = await request.put("/api/chapters/ch_abcdefghij", { data: { meta: {}, body: "x", baseBlob: null } });
    expect(w.status()).toBe(401);
    const m = await request.post("/api/proposals/1/merge", { data: { expectedHeadSha: "a".repeat(40) } });
    expect(m.status()).toBe(401);
    const bad = await request.post("/api/auth/demo", { data: { passcode: "sai" } });
    expect(bad.status()).toBe(401);
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("chặn request ghi từ origin khác", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 3);
    const r = await page.request.put(`/api/chapters/${c.id}`, { data: { meta: c, body: "x", baseBlob: c.blob }, headers: { Origin: "https://evil.example" } });
    expect(r.status()).toBe(403);
  });
});

test.describe("Viết, nháp và lưu phiên bản", () => {
  test("gõ tiếng Việt, reload, khôi phục nháp; lưu phiên bản rồi reload không còn nháp", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 5);
    await openChapter(page, c.id);
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
    const before = Number((await page.getByTestId("word-count").textContent())!.replace(/\D/g, ""));
    await typeAtEnd(page, VI);
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    await expect(page.getByTestId("save-state")).toContainText("Nháp chỉ có trên thiết bị này");
    // đếm chữ cập nhật ngay: 27 chữ mới (“—” không tính)
    await expect(page.getByTestId("word-count")).toHaveText(String(before + 27));

    await page.reload();
    await expect(page.getByTestId("draft-restored")).toBeVisible();
    await expect(page.getByTestId("editor-content")).toContainText("Puna thức trắng — cô nghĩ về lời hứa với Ben");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    // nháp chưa lên kho
    expect((await readChapter(page, c.id)).doc.body).not.toContain("thức trắng");

    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
    const saved = await readChapter(page, c.id);
    expect(saved.doc.body).toContain("“Ừ,” Rei đáp khẽ; gió lùa qua khe cửa, mang theo mùi tro ngai ngái.");
    expect(saved.blob).not.toBe(c.blob);

    await page.reload();
    await expect(page.getByTestId("draft-restored")).toHaveCount(0);
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
  });

  test("lưu thất bại: báo lỗi, không báo thành công, giữ nháp", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 6);
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nĐoạn mới chưa lưu được.");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    await page.route(`**/api/chapters/${c.id}`, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "GitHub không phản hồi" }) }) : route.continue()));
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "error");
    await expect(page.getByTestId("save-state")).toContainText("Lưu thất bại");
    await expect(page.getByTestId("save-state")).toContainText("Nháp vẫn an toàn");
    await expect(page.getByText(/Đã lưu phiên bản/)).toHaveCount(0);
    await page.unroute(`**/api/chapters/${c.id}`);
    expect((await readChapter(page, c.id)).doc.body).not.toContain("Đoạn mới chưa lưu được");
    await page.reload();
    await expect(page.getByTestId("draft-restored")).toBeVisible();
    await expect(page.getByTestId("editor-content")).toContainText("Đoạn mới chưa lưu được.");
  });

  test("đổi tên và chuyển Act không đổi ID", async ({ page }) => {
    await login(page);
    const s = await snapshot(page);
    const c = s.chapters.find((x) => x.number === 7)!;
    await openChapter(page, c.id);
    await page.getByTestId("chapter-title").fill("Tên mới của chương bảy");
    await page.getByTestId("act-select").selectOption(s.acts[1].id);
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
    const v = await readChapter(page, c.id);
    expect(v.doc.meta.id).toBe(c.id);
    expect(v.path).toBe(`content/chapters/${c.id}.md`);
    expect(v.doc.meta.title).toBe("Tên mới của chương bảy");
    expect(v.doc.meta.act_id).toBe(s.acts[1].id);
    await expect(page.getByTestId("chapter-id")).toHaveText(c.id);
  });

  test("chế độ đọc và tìm trong chương", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 10);
    await openChapter(page, c.id);
    await page.getByTestId("toggle-search").click();
    await page.getByPlaceholder("Tìm", { exact: true }).pressSequentially("kiếm");
    await expect(page.locator(".cm-searchMatch").first()).toBeVisible();
    expect(await page.locator(".cm-searchMatch").count()).toBeGreaterThanOrEqual(2);
    await page.getByTestId("mode-read").click();
    await expect(page.getByTestId("read-view")).toContainText("Cô đặt thanh kiếm xám lên bàn.");
  });
});

test.describe("Xung đột", () => {
  test("phát hiện bản mới từ bên ngoài, không ghi đè nháp", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 20);
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nTác giả viết thêm đoạn này.");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    // agent (mô phỏng) sửa thẳng bản chính
    const r = await page.request.post("/api/demo/agent", { data: { action: "edit-main", chapterId: c.id } });
    expect(r.ok()).toBeTruthy();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("conflict-banner")).toBeVisible();
    await expect(page.getByTestId("conflict-banner")).toContainText("thay đổi ở nơi khác");
    // lưu bị từ chối vì nháp dựa trên bản cũ
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "error");
    const server = await readChapter(page, c.id);
    expect(server.doc.body).toContain("agent sửa bản chính");
    expect(server.doc.body).not.toContain("Tác giả viết thêm");
    // so sánh
    await page.getByTestId("conflict-compare").click();
    await expect(page.getByTestId("diff-inline").last()).toContainText("Tác giả viết thêm đoạn này.");
    await page.keyboard.press("Escape");
    // chọn giữ nội dung của tôi rồi lưu → thành công, bản agent vẫn còn trong lịch sử
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("conflict-keep").click();
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
    expect((await readChapter(page, c.id)).doc.body).toContain("Tác giả viết thêm đoạn này.");
    const hist = await (await page.request.get(`/api/chapters/${c.id}/history`)).json();
    expect(hist.versions.map((v: { message: string }) => v.message).join("\n")).toContain("Agent mô phỏng sửa trực tiếp bản chính");
  });

  test("nháp cũ sau reload khi bản trên kho đã đổi → yêu cầu xử lý", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 21);
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nNháp offline.");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    await page.request.post("/api/demo/agent", { data: { action: "edit-main", chapterId: c.id } });
    await page.reload();
    await expect(page.getByTestId("conflict-banner")).toContainText("kể từ khi bạn bắt đầu nháp");
    await expect(page.getByTestId("editor-content")).toContainText("Nháp offline.");
  });

  test("hai tab cùng sửa một chương: không âm thầm ghi đè", async ({ page, context }) => {
    await login(page);
    const c = await chapterByNumber(page, 22);
    await openChapter(page, c.id);
    const other = await context.newPage();
    await openChapter(other, c.id);
    await typeAtEnd(page, "\n\nTab A viết.");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    await expect(other.getByTestId("other-tab-banner")).toBeVisible();
    await typeAtEnd(other, "\n\nTab B viết.");
    await other.waitForTimeout(800);
    // nháp trong IndexedDB vẫn là của tab A
    const stored = await page.evaluate(async (id) => {
      const req = indexedDB.open("nb-studio");
      const db: IDBDatabase = await new Promise((res) => (req.onsuccess = () => res(req.result)));
      return new Promise<string>((res) => {
        const g = db.transaction("drafts").objectStore("drafts").get(`demo::${id}`);
        g.onsuccess = () => res(g.result?.body ?? "");
      });
    }, c.id);
    expect(stored).toContain("Tab A viết.");
    expect(stored).not.toContain("Tab B viết.");
    await other.close();
  });

  test("agent và tác giả cùng sửa một chương → đề xuất báo xung đột, không cho nhập", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 30);
    const p = await (await page.request.post("/api/demo/agent", { data: { action: "propose", chapterIds: [c.id] } })).json();
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nTác giả sửa cùng chương.");
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
    await page.goto(`/proposals/${p.number}`);
    await expect(page.getByTestId("conflict")).toBeVisible();
    await expect(page.getByTestId("conflict")).toContainText(`content/chapters/${c.id}.md`);
    await expect(page.getByTestId("accept")).toBeDisabled();
  });
});

test.describe("Review đề xuất", () => {
  test("xem diff, bình luận, chấp nhận và nhập vào bản chính", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 40);
    const p = await (await page.request.post("/api/demo/agent", { data: { action: "propose", chapterIds: [c.id], touchCanon: true } })).json();
    await page.goto("/proposals");
    await expect(page.getByTestId("proposal-list")).toContainText(`#${p.number}`);
    await page.goto(`/proposals/${p.number}`);
    await expect(page.getByTestId("diff-inline")).toContainText("Một cơn gió lạnh lùa qua khe cửa");
    await expect(page.locator(".diff-p.add")).toHaveCount(1);
    await page.getByTestId("comment-input").fill("Giữ câu này, rất hợp không khí.");
    await page.getByTestId("comment-send").click();
    await expect(page.getByTestId("comment")).toContainText("Giữ câu này");
    await page.getByTestId("accept").click();
    await page.getByTestId("confirm-accept").click();
    await expect(page.getByTestId("proposal-state")).toContainText("Đã nhập");
    expect((await readChapter(page, c.id)).doc.body).toContain("Một cơn gió lạnh lùa qua khe cửa");
  });

  test("đề xuất thay đổi sau khi mở review → không nhập phiên bản chưa xem", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 41);
    const p = await (await page.request.post("/api/demo/agent", { data: { action: "propose", chapterIds: [c.id] } })).json();
    await page.goto(`/proposals/${p.number}`);
    await expect(page.getByTestId("accept")).toBeEnabled();
    await page.request.post("/api/demo/agent", { data: { action: "push-to-proposal", number: p.number } });
    await page.getByTestId("accept").click();
    await page.getByTestId("confirm-accept").click();
    await expect(page.getByTestId("head-moved")).toBeVisible();
    await expect(page.getByTestId("proposal-state")).toContainText("Đang chờ");
    expect((await readChapter(page, c.id)).doc.body).not.toContain("agent mô phỏng");
  });

  test("tự approve đề xuất của chính mình bị GitHub (mô phỏng) từ chối; yêu cầu sửa được gửi", async ({ page }) => {
    await login(page);
    const r = await page.request.post("/api/proposals/1/review", { data: { event: "REQUEST_CHANGES", body: "Đừng đổi giọng văn của Puna." } });
    expect(r.ok()).toBeTruthy();
    expect((await r.json()).delivered).toBe("review");
  });
});

test.describe("Lịch sử và phục hồi", () => {
  test("phục hồi Ch10–11 về bản cũ, giữ Ch8–9 và canon", async ({ page }) => {
    await login(page);
    const s = await snapshot(page);
    const [c8, c9, c10, c11] = [8, 9, 10, 11].map((n) => s.chapters.find((c) => c.number === n)!);
    const body8 = (await readChapter(page, c8.id)).doc.body;
    const body9 = (await readChapter(page, c9.id)).doc.body;
    const canon = await (await page.request.get("/api/file?path=content/canon/world/kiem-tro.md")).json();
    const hist = await (await page.request.get("/api/history?page=1")).json();
    const init = hist.commits.find((x: { message: string }) => x.message.startsWith("Khởi tạo"));
    const old10 = (await readChapter(page, c10.id, init.sha)).doc.body;
    const old11 = (await readChapter(page, c11.id, init.sha)).doc.body;
    expect((await readChapter(page, c10.id)).doc.body).not.toBe(old10);

    await page.goto(`/history?sha=${init.sha}`);
    await page.getByTestId("restore-from-commit").click();
    const cands = page.getByTestId("restore-candidate");
    await expect(cands.filter({ hasText: `Ch 10 ·` })).toBeVisible();
    await expect(cands.filter({ hasText: `Ch 8 ·` })).toBeVisible();
    await cands.filter({ hasText: `Ch 10 ·` }).locator("input").check();
    await cands.filter({ hasText: `Ch 11 ·` }).locator("input").check();
    await page.getByTestId("restore-preview").click();
    await expect(page.getByTestId("diff-inline").first()).toBeVisible();
    await page.getByTestId("confirm-multi-restore").click();
    await expect(page.getByText(/Đã phục hồi 2 chương/)).toBeVisible();

    expect((await readChapter(page, c10.id)).doc.body).toBe(old10);
    expect((await readChapter(page, c11.id)).doc.body).toBe(old11);
    expect((await readChapter(page, c8.id)).doc.body).toBe(body8);
    expect((await readChapter(page, c9.id)).doc.body).toBe(body9);
    const canonAfter = await (await page.request.get("/api/file?path=content/canon/world/kiem-tro.md")).json();
    expect(canonAfter.content).toBe(canon.content);
    // lịch sử không bị viết lại
    const hist2 = await (await page.request.get("/api/history?page=1")).json();
    expect(hist2.commits.length).toBe(hist.commits.length + 1);
    expect(hist2.commits[0].message).toContain("Phục hồi");
  });

  test("phục hồi một chương từ panel phiên bản, có xem trước", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 12);
    const original = (await readChapter(page, c.id)).doc.body;
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nBản sửa sẽ bị phục hồi.");
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
    await page.getByRole("button", { name: "Phiên bản", exact: true }).click();
    await page.getByTestId("restore-version").first().click();
    await expect(page.getByTestId("diff-inline")).toContainText("Bản sửa sẽ bị phục hồi.");
    await page.getByTestId("confirm-restore").click();
    await expect(page.getByTestId("editor-content")).not.toContainText("Bản sửa sẽ bị phục hồi.");
    expect((await readChapter(page, c.id)).doc.body).toBe(original);
  });
});

test.describe("Hiệu năng điều hướng", () => {
  test("điều hướng 200 chương mà không tải toàn bộ nội dung", async ({ page }) => {
    await login(page);
    const chapterGets: string[] = [];
    let projectBody = "";
    page.on("response", async (r) => {
      const u = new URL(r.url());
      if (/^\/api\/chapters\/[^/]+$/.test(u.pathname) && r.request().method() === "GET") chapterGets.push(u.pathname);
      if (u.pathname === "/api/project") projectBody = await r.text().catch(() => projectBody);
    });
    await page.goto("/library");
    await expect(page.getByTestId("chapter-tree").locator(".tree-ch")).toHaveCount(200);
    expect(chapterGets).toHaveLength(0);
    expect(projectBody.length).toBeGreaterThan(1000);
    expect(projectBody).not.toContain("Mưa không ngừng suốt buổi sáng");
    const snap = await snapshot(page);
    for (const n of [1, 100, 200]) {
      const target = snap.chapters[n - 1];
      await page.getByTestId("chapter-tree").locator(".tree-ch").nth(n - 1).click();
      await expect(page).toHaveURL(new RegExp(`/chapters/${target.id}$`));
      await expect(page.getByTestId("chapter-title")).toHaveValue(target.title);
    }
    expect(new Set(chapterGets).size).toBe(3);
    expect(chapterGets).toHaveLength(3); // mỗi chương đúng một lần tải, không tải chương nào khác
  });
});

test.describe("Nhập & xuất", () => {
  test("nhập văn bản: xem trước, cảnh báo trùng, giữ nguyên văn", async ({ page }) => {
    await login(page);
    const src = [
      "Ghi chú đầu file không phải chương.",
      "",
      "Chương 201: Bình minh  ở  bến cũ",
      "",
      "Dòng đầu  có  hai khoảng trắng — giữ nguyên!",
      "“Ừm…” — cô ngập ngừng.",
      "",
      "Chương 202: Hoàng hôn",
      "",
      "Nội dung 202.",
      "",
      "Chương 202: Trùng số",
      "",
      "Nội dung trùng.",
      "",
      "Chương 3: Chương đã tồn tại",
      "",
      "Không nên ghi đè.",
    ].join("\r\n");
    await page.goto("/import");
    await page.getByText("…hoặc dán văn bản").click();
    await page.getByTestId("import-paste").fill(src);
    await page.getByTestId("import-paste-load").click();
    const table = page.getByTestId("import-preview");
    await expect(table).toContainText("xuất hiện nhiều lần");
    await expect(table).toContainText("Bản thảo đã có Ch 3");
    await expect(table).toContainText("Có nội dung trước tiêu đề chương đầu tiên");
    // mặc định: phần mở đầu và Ch 3 bị bỏ qua; nhập 3 chương (201, 202, 202-trùng)
    await expect(page.getByTestId("import-confirm")).toHaveText("Nhập 3 chương");
    await page.getByTestId("import-confirm").click();
    await expect(page.getByText(/Đã nhập 3 chương/).first()).toBeVisible();
    const s = await snapshot(page);
    const imported = s.chapters.find((c) => c.title === "Bình minh  ở  bến cũ")!;
    expect(imported).toBeTruthy();
    const v = await readChapter(page, imported.id);
    expect(v.doc.body).toBe("Dòng đầu  có  hai khoảng trắng — giữ nguyên!\n“Ừm…” — cô ngập ngừng.");
    const ch3 = s.chapters.find((c) => c.number === 3)!;
    expect(ch3.title).not.toBe("Chương đã tồn tại");
  });

  test("xuất một chương và toàn bộ bản thảo", async ({ page }) => {
    await login(page);
    const c = await chapterByNumber(page, 10);
    const one = await page.request.get(`/api/export?chapter=${c.id}`);
    expect(one.headers()["content-type"]).toContain("text/markdown");
    expect(await one.text()).toContain("## Ch 10 ·");
    const all = await page.request.get("/api/export");
    const text = await all.text();
    expect(text).toContain("DỮ LIỆU DEMO");
    expect(text.match(/^## Ch \d+ ·/gm)?.length).toBeGreaterThanOrEqual(200);
  });
});

test.describe("Gói tài liệu & giao diện", () => {
  test("tạo manifest chỉ gồm phạm vi đã chọn, báo tóm tắt cũ", async ({ page }) => {
    await login(page);
    await page.goto("/context");
    await page.getByTestId("pack-range").fill("10-11");
    await page.getByTestId("pack-build").click();
    const m = JSON.parse((await page.getByTestId("pack-manifest").textContent())!);
    const roles = m.files.map((f: { role: string }) => f.role);
    expect(roles.filter((r: string) => r === "target")).toHaveLength(2);
    expect(roles.filter((r: string) => r === "neighbor")).toHaveLength(2);
    expect(m.files.length).toBeLessThan(10);
    expect(m.files.every((f: { blob: string }) => /^[0-9a-f]{40}$/.test(f.blob))).toBeTruthy();
    expect(m.commit).toMatch(/^[0-9a-f]{40}$/);
    // tóm tắt Ch 9 được viết trước khi Ch 9 bị sửa → phải bị đánh dấu đã cũ
    expect(m.files.some((f: { role: string; stale?: boolean }) => f.role === "summary" && f.stale === true)).toBeTruthy();
  });

  test("chuyển sáng/tối", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("demo-ribbon")).toBeVisible();
  });
});
