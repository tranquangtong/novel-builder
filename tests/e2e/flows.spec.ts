import { expect, test } from "@playwright/test";
import { B, call, chapterByNumber, go, openChapter, readChapter, snapshot, typeAtEnd, useDemo } from "./helpers";

const VI = "\n\nĐêm ấy, Puna thức trắng — cô nghĩ về lời hứa với Ben. “Ừ,” Rei đáp khẽ; gió lùa qua khe cửa, mang theo mùi tro ngai ngái.";

test.describe("Truy cập", () => {
  test("chưa kết nối: chỉ vào được trang Kết nối, không gửi request ra ngoài", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("http://localhost")) external.push(r.url());
    });
    await go(page, "/library/");
    await expect(page).toHaveURL(new RegExp(`${B}/settings/$`));
    await expect(page.getByTestId("conn-token")).toBeVisible();
    await expect(page.getByTestId("chapter-tree")).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test("CSP chỉ cho phép kết nối tới chính trang và api.github.com", async ({ page }) => {
    await go(page, "/settings/");
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain("connect-src 'self' https://api.github.com");
    const blocked = await page.evaluate(() => fetch("https://example.com/").then(() => "ok", () => "blocked"));
    expect(blocked).toBe("blocked");
  });
});

test.describe("Viết, nháp và lưu phiên bản", () => {
  test("gõ tiếng Việt, reload, khôi phục nháp; lưu phiên bản rồi reload không còn nháp", async ({ page }) => {
    await useDemo(page);
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

  test("đổi tên và chuyển Act không đổi ID", async ({ page }) => {
    await useDemo(page);
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
    await useDemo(page);
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
    await useDemo(page);
    const c = await chapterByNumber(page, 20);
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nTác giả viết thêm đoạn này.");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    // agent (mô phỏng) sửa thẳng bản chính
    await call(page, "POST", "/api/demo/agent", { action: "edit-main", chapterId: c.id });
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
    const hist = await call<{ versions: { message: string }[] }>(page, "GET", `/api/chapters/${c.id}/history`);
    expect(hist.versions.map((v: { message: string }) => v.message).join("\n")).toContain("Agent mô phỏng sửa trực tiếp bản chính");
  });

  test("nháp cũ sau reload khi bản trên kho đã đổi → yêu cầu xử lý", async ({ page }) => {
    await useDemo(page);
    const c = await chapterByNumber(page, 21);
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nNháp offline.");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "local");
    await call(page, "POST", "/api/demo/agent", { action: "edit-main", chapterId: c.id });
    await page.reload();
    await expect(page.getByTestId("conflict-banner")).toContainText("kể từ khi bạn bắt đầu nháp");
    await expect(page.getByTestId("editor-content")).toContainText("Nháp offline.");
  });

  test("chưa sửa gì mà bản chính đổi (vd. nhập đề xuất) → tự tải bản mới, không hiện lỗi đỏ", async ({ page }) => {
    await useDemo(page);
    const c = await chapterByNumber(page, 23);
    await openChapter(page, c.id);
    await call(page, "POST", "/api/demo/agent", { action: "edit-main", chapterId: c.id });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId("auto-updated")).toBeVisible();
    await expect(page.getByTestId("conflict-banner")).toHaveCount(0);
    await expect(page.getByTestId("editor-content")).toContainText("agent sửa bản chính");
    // đã đồng bộ với bản mới: không còn là nháp chưa lưu
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
  });

  test("nháp cũ không có chỉnh sửa thật, sau reload khi bản chính đã đổi → tự dùng bản mới", async ({ page }) => {
    await useDemo(page);
    const c = await chapterByNumber(page, 24);
    await openChapter(page, c.id);
    const v = await readChapter(page, c.id);
    const { id: _id, ...meta } = v.doc.meta;
    void _id;
    // mô phỏng nháp còn sót lại: y hệt phiên bản nó dựa vào
    await page.evaluate(
      async ({ v, meta }) => {
        const open = indexedDB.open("nb-studio");
        const db: IDBDatabase = await new Promise((res, rej) => {
          open.onsuccess = () => res(open.result);
          open.onerror = () => rej(open.error);
        });
        await new Promise<void>((res, rej) => {
          const tx = db.transaction("drafts", "readwrite");
          tx.objectStore("drafts").put({ key: `${v.repo}::${v.doc.meta.id}`, repoKey: v.repo, chapterId: v.doc.meta.id, baseBlob: v.blob, baseCommit: v.commitSha, body: v.doc.body, meta, updatedAt: Date.now(), tabId: "tab-cu" });
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        });
        db.close();
      },
      { v, meta },
    );
    await call(page, "POST", "/api/demo/agent", { action: "edit-main", chapterId: c.id });
    await page.reload();
    await expect(page.getByTestId("editor-content")).toContainText("agent sửa bản chính");
    await expect(page.getByTestId("conflict-banner")).toHaveCount(0);
    await expect(page.getByTestId("auto-updated")).toBeVisible();
  });

  test("hai tab cùng sửa một chương: không âm thầm ghi đè", async ({ page, context }) => {
    await useDemo(page);
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
    await useDemo(page);
    const c = await chapterByNumber(page, 30);
    const p = await call<{ number: number }>(page, "POST", "/api/demo/agent", { action: "propose", chapterIds: [c.id] });
    await openChapter(page, c.id);
    await typeAtEnd(page, "\n\nTác giả sửa cùng chương.");
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "synced");
    await go(page, `/proposal/?n=${p.number}`);
    await expect(page.getByTestId("conflict")).toBeVisible();
    await expect(page.getByTestId("conflict")).toContainText(`content/chapters/${c.id}.md`);
    await expect(page.getByTestId("accept")).toBeDisabled();
    await expect(page.getByTestId("accept-blocked")).toContainText("xung đột");
  });
});

test.describe("Review đề xuất", () => {
  test("xem diff, bình luận, chấp nhận và nhập vào bản chính", async ({ page }) => {
    await useDemo(page);
    const c = await chapterByNumber(page, 40);
    const p = await call<{ number: number }>(page, "POST", "/api/demo/agent", { action: "propose", chapterIds: [c.id], touchCanon: true });
    await go(page, "/proposals/");
    await expect(page.getByTestId("proposal-list")).toContainText(`#${p.number}`);
    await go(page, `/proposal/?n=${p.number}`);
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
    await useDemo(page);
    const c = await chapterByNumber(page, 41);
    const p = await call<{ number: number }>(page, "POST", "/api/demo/agent", { action: "propose", chapterIds: [c.id] });
    await go(page, `/proposal/?n=${p.number}`);
    await expect(page.getByTestId("accept")).toBeEnabled();
    await call(page, "POST", "/api/demo/agent", { action: "push-to-proposal", number: p.number });
    await page.getByTestId("accept").click();
    await page.getByTestId("confirm-accept").click();
    await expect(page.getByTestId("head-moved")).toBeVisible();
    await expect(page.getByTestId("proposal-state")).toContainText("Đang chờ");
    expect((await readChapter(page, c.id)).doc.body).not.toContain("agent mô phỏng");
  });

  test("yêu cầu sửa gửi thành review chính thức khi tác giả PR là agent", async ({ page }) => {
    await useDemo(page);
    const r = await call<{ delivered: string }>(page, "POST", "/api/proposals/1/review", { event: "REQUEST_CHANGES", body: "Đừng đổi giọng văn của Puna." });
    expect(r.delivered).toBe("review");
  });
});

test("trang review: hai cột có thanh cuộn riêng, trang không cuộn chung", async ({ page }) => {
  await useDemo(page);
  const ids = (await snapshot(page)).chapters.slice(20, 30).map((c) => c.id);
  const p = await call<{ number: number }>(page, "POST", "/api/demo/agent", { action: "propose", chapterIds: ids });
  await go(page, `/proposal/?n=${p.number}`);
  await expect(page.getByTestId("diff-inline")).toBeVisible();
  const right = page.getByTestId("review-col-right");
  const left = page.getByTestId("review-col-left");
  // nội dung dài hơn màn hình → cột phải tự cuộn
  await page.getByText("hiện đoạn không đổi").click();
  const m = await right.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, ov: getComputedStyle(el).overflowY }));
  expect(m.ov).toBe("auto");
  expect(m.sh).toBeGreaterThan(m.ch);
  await right.evaluate((el) => el.scrollTo(0, 400));
  expect(await right.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await left.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.locator(".page.review-page").evaluate((el) => el.scrollTop)).toBe(0);
  // tiêu đề vẫn nhìn thấy sau khi cuộn
  await expect(page.locator("h1")).toBeInViewport();
});

test.describe("Lịch sử và phục hồi", () => {
  test("phục hồi Ch10–11 về bản cũ, giữ Ch8–9 và canon", async ({ page }) => {
    await useDemo(page);
    const s = await snapshot(page);
    const [c8, c9, c10, c11] = [8, 9, 10, 11].map((n) => s.chapters.find((c) => c.number === n)!);
    const body8 = (await readChapter(page, c8.id)).doc.body;
    const body9 = (await readChapter(page, c9.id)).doc.body;
    const canon = await call<{ content: string }>(page, "GET", "/api/file?path=content/canon/world/kiem-tro.md");
    const hist = await call<{ commits: { sha: string; message: string }[] }>(page, "GET", "/api/history?page=1");
    const init = hist.commits.find((x) => x.message.startsWith("Khởi tạo"))!;
    const old10 = (await readChapter(page, c10.id, init.sha)).doc.body;
    const old11 = (await readChapter(page, c11.id, init.sha)).doc.body;
    expect((await readChapter(page, c10.id)).doc.body).not.toBe(old10);

    await go(page, `/history/?sha=${init.sha}`);
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
    const canonAfter = await call<{ content: string }>(page, "GET", "/api/file?path=content/canon/world/kiem-tro.md");
    expect(canonAfter.content).toBe(canon.content);
    // lịch sử không bị viết lại
    const hist2 = await call<{ commits: { message: string }[] }>(page, "GET", "/api/history?page=1");
    expect(hist2.commits.length).toBe(hist.commits.length + 1);
    expect(hist2.commits[0].message).toContain("Phục hồi");
  });

  test("phục hồi một chương từ panel phiên bản, có xem trước", async ({ page }) => {
    await useDemo(page);
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

test.describe("Nhập & xuất", () => {
  test("nhập văn bản: xem trước, cảnh báo trùng, giữ nguyên văn", async ({ page }) => {
    await useDemo(page);
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
    await go(page, "/import/");
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
    await useDemo(page);
    const c = await chapterByNumber(page, 10);
    await openChapter(page, c.id);
    const [d1] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Xuất .md" }).click()]);
    const fs = await import("node:fs");
    expect(fs.readFileSync((await d1.path())!, "utf8")).toContain("## Ch 10 ·");
    await go(page, "/import/");
    const [d2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Tải toàn bộ bản thảo (.md)" }).click()]);
    const text = fs.readFileSync((await d2.path())!, "utf8");
    expect(text).toContain("DỮ LIỆU DEMO");
    expect(text.match(/^## Ch \d+ ·/gm)?.length).toBe(200);
  });
});

test.describe("Gói tài liệu & giao diện", () => {
  test("tạo manifest chỉ gồm phạm vi đã chọn, báo tóm tắt cũ", async ({ page }) => {
    await useDemo(page);
    await go(page, "/context/");
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
    await useDemo(page);
    await go(page, "/");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("demo-ribbon")).toBeVisible();
  });
});

test.describe("Act 0 · Outline & Trivia", () => {
  test("chuyển outline/canon cũ vào Act 0 bằng một nút; menu Canon & outline không còn", async ({ page }) => {
    await useDemo(page);
    await go(page, "/library/");
    await expect(page.getByRole("link", { name: "Canon & outline" })).toHaveCount(0);
    await expect(page.getByTestId("notes-act-setup")).toBeVisible();
    await page.getByTestId("notes-act-run").click();
    await expect(page.getByTestId("notes-act-setup")).toHaveCount(0);
    const snap = await snapshot(page);
    const act0 = snap.acts.find((a) => a.kind === "notes")!;
    expect(act0.title).toBe("Act 0 · Outline & Trivia");
    const notes = snap.chapters.filter((c) => c.note);
    expect(notes.map((n) => n.title)).toContain("Outline Act I");
    expect(snap.chapters.filter((c) => !c.note)).toHaveLength(200);
    await expect(page.getByText("Outline Act I").first()).toBeVisible();
    // ghi chú mở được trong trình soạn, không có số chương
    await openChapter(page, notes[0].id);
    await expect(page.locator(".chapter-kicker")).toContainText("Ghi chú");
    // trang /canon không còn
    const res = await page.goto(`${B}/canon/`);
    expect(res?.status()).toBe(404);
  });
});

