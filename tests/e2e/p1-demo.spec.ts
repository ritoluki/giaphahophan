import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const reviewDirectory = path.join(process.cwd(), "reports", "design-review", "frontend-refactor-20261103");
const demoPersonId = "0e6ee4e5-9816-52b8-bc8b-33d7c79efe9c";

async function capture(page: Page, name: string, projectName: string) {
  await fs.mkdir(reviewDirectory, { recursive: true });
  await page.screenshot({ path: path.join(reviewDirectory, `${name}-${projectName}.png`), fullPage: true });
}

test("home presents a clear search action and labels demo data", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tìm người trong gia phả", exact: true })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByText("Dữ liệu minh họa", { exact: false }).first()).toBeVisible();
  await capture(page, "home", testInfo.project.name);
});

test("search keeps result context and opens a demo profile", async ({ page }, testInfo) => {
  await page.goto("/tra-cuu");
  await page.getByLabel("Tìm người", { exact: true }).fill("Phan Đức An");
  await expect(page.getByRole("link", { name: /Phan Đức An/ })).toBeVisible();
  await page.getByRole("link", { name: /Phan Đức An/ }).click();
  await expect(page).toHaveURL(new RegExp(`/nguoi/${demoPersonId}$`));
  await expect(page.getByRole("heading", { name: "Phan Đức An" })).toBeVisible();
  await capture(page, "person", testInfo.project.name);
});

test("search matches an unaccented alias and preserves canonical display", async ({ page }) => {
  await page.goto("/tra-cuu");
  await page.getByLabel("Tìm người", { exact: true }).fill("phan do");
  await expect(page.getByRole("link", { name: /Phan Đức An/ })).toBeVisible();
  await expect(page.getByText("Tên khác: Phan Đỗ", { exact: true })).toBeVisible();
});

test("search applies status and birth-year filters without changing result identity", async ({ page }) => {
  await page.goto("/tra-cuu");
  await page.getByLabel("Tìm người", { exact: true }).fill("Phan");
  await page.locator(".search-filters summary").click();
  await page.getByLabel("Tình trạng").selectOption("deceased");
  await page.getByLabel("Năm sinh").fill("1870");
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(page.getByRole("link", { name: /Phan Đức An/ })).toBeVisible();
  await expect(page.getByText("1 người", { exact: true })).toBeVisible();
});

test("family focus is readable before the optional tree view", async ({ page }, testInfo) => {
  await page.goto("/gia-pha");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gia phả");
  await expect(page.getByRole("heading", { name: "Bạn muốn xem gia đình của ai?" })).toBeVisible();
  await page.getByLabel("Tìm người trong gia phả").fill("Phan Đức An");
  await page.locator(".family-search-results").getByRole("button", { name: /Phan Đức An/ }).click();
  await expect(page.getByRole("heading", { name: "Gia đình của Phan Đức An", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cha mẹ", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Con", exact: true })).toBeVisible();
  await expect(page.locator(".family-diagram-dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Mở sơ đồ" }).click();
  await expect(page.getByRole("dialog", { name: "Sơ đồ gia đình của Phan Đức An" })).toBeVisible();
  await expect(page.locator(".family-diagram-canvas")).toBeVisible();
  await capture(page, "family-focus", testInfo.project.name);
});

test("calendar and sources preserve uncertainty labels", async ({ page }, testInfo) => {
  await page.goto("/lich-ho");
  await expect(page.getByRole("heading", { name: "Lịch họ", exact: true })).toBeVisible();
  await expect(page.getByText("Cần đối chiếu ngày", { exact: true }).first()).toBeVisible();
  await capture(page, "calendar", testInfo.project.name);

  await page.goto("/tu-lieu");
  await expect(page.getByRole("heading", { name: "Thư viện tư liệu" })).toBeVisible();
  await expect(page.locator(".source-list").getByText("Tạo cho agent kit; không phải tư liệu gia đình.", { exact: false }).first()).toBeVisible();
  await capture(page, "sources", testInfo.project.name);
});

test("admin overview links to real workspaces and each enforces restrictions", async ({ page }, testInfo) => {
  await page.goto("/quan-tri");
  await expect(page.getByRole("heading", { name: "Quản lý gia phả", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quản lý thành viên", exact: true })).toHaveAttribute("href", "/quan-tri/thanh-vien");
  await expect(page.getByRole("link", { name: "Mở phần nhập liệu", exact: true })).toHaveAttribute("href", "/quan-tri/nhap-lieu");
  await expect(page.getByRole("link", { name: "Mở phần xuất gia phả", exact: true })).toHaveAttribute("href", "/quan-tri/xuat-lieu");
  await expect(page.locator(".admin-grid button[type=submit]")).toHaveCount(0);
  await capture(page, "admin", testInfo.project.name);
  await page.getByRole("link", { name: "Quản lý thành viên", exact: true }).click();
  await expect(page.locator(".admin-restricted")).toBeVisible();
  await expect(page.locator(".membership-list")).toHaveCount(0);
});

test("person profile exposes family first and expandable records without losing empty states", async ({ page }) => {
  await page.goto("/nguoi/" + demoPersonId);
  await expect(page.getByRole("heading", { name: "Gia đình", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cha mẹ", exact: true })).toBeVisible();
  await page.locator("summary", { hasText: "Liên kết tài khoản hoặc đề nghị ẩn hồ sơ" }).click();
  await expect(page.locator("#deletion-impact-title")).toBeVisible();
  await expect(page.locator(".deletion-impact-card button")).toBeVisible();
  await page.locator("summary", { hasText: "Dòng thời gian" }).click();
  await expect(page.getByRole("heading", { name: "Thông tin sinh", exact: true })).toBeVisible();
  await expect(page.locator(".profile-timeline")).toContainText("Thông tin gốc: 1870");
  await page.locator("summary", { hasText: "Nguồn tư liệu" }).click();
  await expect(page.locator(".source-card").first()).toBeVisible();
  await page.locator("summary", { hasText: "Ảnh của hồ sơ" }).click();
  await expect(page.getByText("Chưa có ảnh được chia sẻ cho hồ sơ này.", { exact: true })).toBeVisible();
});

test("tree explorer keeps bounded diagram options, zoom and fullscreen focus usable", async ({ page }) => {
  await page.goto("/gia-pha?root=" + demoPersonId);
  const options = page.locator(".family-options");
  await options.locator("summary").click();
  await page.getByLabel("Phạm vi sơ đồ").selectOption("ancestors");
  await page.getByLabel("Số thế hệ trong sơ đồ").selectOption("3");
  await options.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/mode=ancestors/);
  await expect(page).toHaveURL(/depth=3/);
  await options.locator("summary").click();
  await page.getByLabel("Phạm vi sơ đồ").selectOption("descendants");
  await options.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/mode=descendants/);
  await page.getByRole("button", { name: "Mở sơ đồ" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  const cap = (page.viewportSize()?.width ?? 0) >= 768 ? 300 : 120;
  expect(await page.locator(".react-flow__node").count()).toBeLessThanOrEqual(cap);
  const viewport = page.locator(".react-flow__viewport");
  const initialTransform = await viewport.getAttribute("style");
  await page.getByRole("button", { name: "Phóng to sơ đồ" }).click();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(initialTransform);
  await page.getByRole("button", { name: "Thu nhỏ sơ đồ" }).click();
  await page.getByRole("button", { name: "Về người đang xem" }).click();
  await page.getByRole("button", { name: "Xem toàn sơ đồ", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Mở sơ đồ" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Gia đình của Phan Đức An", exact: true })).toBeVisible();
});

test("kinship finder exposes bounded permission-aware paths", async ({ page }, testInfo) => {
  await page.goto("/quan-he");
  await expect(page.getByRole("heading", { name: "Chọn hai người", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(2);
  await page.getByRole("button", { name: "Xem quan hệ", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Mối liên hệ/ }).first()).toBeVisible();
  await expect(page.getByText("Cách xưng hô cụ thể còn tùy thứ bậc", { exact: false })).toBeVisible();
  await capture(page, "kinship", testInfo.project.name);
});
test("keyboard and basic accessibility contracts remain available", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await expect(page.locator(".skip-link")).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");

  const imageAltComplete = await page.locator("img").evaluateAll((images) => images.every((image) => image.getAttribute("alt") !== null));
  expect(imageAltComplete).toBe(true);

  const primaryTargets = await page.locator("button, summary, .button-primary, .button-secondary").evaluateAll((elements) => elements.every((element) => {
    if (element.getClientRects().length === 0) return true;
    const rect = element.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44;
  }));
  expect(primaryTargets).toBe(true);

  const bottomNavTargets = await page.locator(".bottom-nav a").evaluateAll((elements) => elements.every((element) => {
    const navigation = element.closest(".bottom-nav");
    if (!navigation || getComputedStyle(navigation).display === "none") return true;
    const rect = element.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44;
  }));
  expect(bottomNavTargets).toBe(true);
});

test("invitation page keeps token and private tree details out of visible copy", async ({ page }) => {
  const token = "synthetic-invitation-token-2026-09-27";
  await page.goto("/loi-moi/" + token);
  await expect(page.getByRole("heading", { name: "Xác nhận lời mời" })).toBeVisible();
  await expect(page.getByText("Thông tin gia phả sẽ hiện sau khi tài khoản được kiểm tra và duyệt.", { exact: false })).toBeVisible();
  await expect(page.locator("button[type=submit]")).toBeDisabled();
  expect(await page.locator("main").innerText()).not.toContain(token);
});
test("MFA setup stays restricted until a member session is present", async ({ page }) => {
  await page.goto("/thiet-lap-mfa");
  await expect(page.getByRole("heading", { name: "Xác thực hai bước", exact: true })).toBeVisible();
  await expect(page.getByText("Cần đăng nhập", { exact: true })).toBeVisible();
});
test("account page gives anonymous relatives a clear sign-in action", async ({ page }) => {
  await page.goto("/them");
  await expect(page.getByRole("heading", { name: "Tài khoản của bạn", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quên mật khẩu", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toHaveCount(0);
});


test("membership administration exposes restricted state without a session", async ({ page }) => {
  await page.goto("/quan-tri/thanh-vien");
  await expect(page.locator("main > h1")).toBeVisible();
  await expect(page.locator(".admin-restricted")).toBeVisible();
});

test("import intake keeps demo-only safeguards and remains mobile-sized without capability", async ({ page }) => {
  await page.route("**/api/v1/imports**", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ data: { code: "AUTH_REQUIRED", message: "A verified session is required" }, meta: { requestId: "00000000-0000-4000-8000-000000000099" } }),
  }));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/quan-tri/nhap-lieu");
  await expect(page.locator(".import-page h1")).toBeVisible();
  await expect(page.getByLabel("Gia phả cần nhập")).toBeDisabled();
  await expect(page.getByLabel("Tệp JSON · tối đa 10 MiB")).toBeVisible();
  await expect(page.getByText(/Chưa mở nhập dữ liệu gia đình thật/)).toBeVisible();
  await expect(page.locator(".import-form [role=alert]")).toContainText("Đăng nhập để tiếp tục.");
  await expect(page.locator(".import-form [role=alert]")).not.toContainText("verified session");
  await expect(page.locator(".import-result")).toHaveCount(0);
  const previewResponse = await page.evaluate(async () => {
    const response = await fetch("/api/v1/imports/00000000-0000-4000-8000-000000000099/preview");
    return { status: response.status, body: await response.text() };
  });
  expect(previewResponse.status).toBe(401);
  expect(previewResponse.body).not.toContain("sampleRows");
  await page.getByLabel("Định dạng").selectOption("csv");
  await expect(page.getByLabel("Tiêu đề cột mã nguồn")).toBeVisible();
  await expect(page.locator("#mapping-birth-date")).toHaveValue("");
  await expect(page.locator("#mapping-death-date")).toHaveValue("");
  await expect(page.locator("#mapping-gender")).toHaveValue("");
  await expect(page.locator("#mapping-notes")).toHaveValue("");
  await expect(page.getByLabel("Tiêu đề cột ngày sinh (không bắt buộc)")).toBeVisible();
  await expect(page.getByLabel("Tiêu đề cột ngày mất (không bắt buộc)")).toBeVisible();
  await expect(page.getByLabel("Tiêu đề cột giới tính ghi nhận (không bắt buộc)")).toBeVisible();
  await expect(page.getByLabel("Tiêu đề cột ghi chú nguồn (không bắt buộc)")).toBeVisible();
  await expect(page.getByLabel("Cách đọc ngày tháng")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("password recovery keeps enumeration-safe and reset states usable on mobile", async ({ page }) => {
  await page.goto("/quen-mat-khau");
  await expect(page.locator("#recovery-email")).toBeVisible();
  await expect(page.locator(".recovery-form button[type=submit]")).toBeEnabled();
  await page.goto("/quen-mat-khau?mode=reset");
  await expect(page.locator("#recovery-password")).toBeVisible();
  await expect(page.locator("#recovery-confirmation")).toBeVisible();
  await page.locator("#recovery-password").fill("Synthetic!123456");
  await page.locator("#recovery-confirmation").fill("Synthetic!654321");
  await page.locator(".recovery-form button[type=submit]").click();
  await expect(page.locator(".field-error")).toBeVisible();
});
test("proposal contribution stays restricted without a member session", async ({ page }) => {
  await page.goto("/dong-gop/moi");
  await expect(page.getByRole("heading", { name: "Gửi đề nghị bổ sung" })).toBeVisible();
  await expect(page.locator(".proposal-state")).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("media viewer is mobile-safe and user-initiated", async ({ page }) => {
  await page.goto("/tu-lieu");
  await expect(page.locator(".media-viewer-card")).toHaveCount(4);
  await expect(page.locator(".media-viewer-card button")).toHaveCount(4);
  await page.locator(".media-viewer-card").first().getByRole("button").click();
  await expect(page.locator(".media-viewer-image")).toBeVisible();
  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsViewport).toBe(true);
});
