import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const reviewDirectory = path.join(process.cwd(), "reports", "design-review");
const demoPersonId = "0e6ee4e5-9816-52b8-bc8b-33d7c79efe9c";

async function capture(page: Page, name: string, projectName: string) {
  await fs.mkdir(reviewDirectory, { recursive: true });
  await page.screenshot({ path: path.join(reviewDirectory, `${name}-${projectName}.png`), fullPage: true });
}

test("home presents the approved demo direction", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Một gia phả là câu chuyện về những người đi trước." })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByText("Dữ liệu minh họa", { exact: false }).first()).toBeVisible();
  await capture(page, "home", testInfo.project.name);
});

test("search keeps result context and opens a demo profile", async ({ page }, testInfo) => {
  await page.goto("/tra-cuu");
  await page.getByLabel("Từ khóa").fill("Phan Đức An");
  await expect(page.getByRole("link", { name: /Phan Đức An/ })).toBeVisible();
  await page.getByRole("link", { name: /Phan Đức An/ }).click();
  await expect(page).toHaveURL(new RegExp(`/nguoi/${demoPersonId}$`));
  await expect(page.getByRole("heading", { name: "Phan Đức An" })).toBeVisible();
  await capture(page, "person", testInfo.project.name);
});

test("search matches an unaccented alias and preserves canonical display", async ({ page }) => {
  await page.goto("/tra-cuu");
  await page.getByLabel("Từ khóa").fill("phan do");
  await expect(page.getByRole("link", { name: /Phan Đức An/ })).toBeVisible();
  await expect(page.getByText("Tên khác: Phan Đỗ", { exact: true })).toBeVisible();
});

test("search applies status and birth-year filters without changing result identity", async ({ page }) => {
  await page.goto("/tra-cuu");
  await page.getByLabel("Từ khóa").fill("Phan");
  await page.getByLabel("Trạng thái").selectOption("deceased");
  await page.getByLabel("Năm sinh").fill("1870");
  await expect(page.getByRole("link", { name: /Phan Đức An/ })).toBeVisible();
  await expect(page.getByText("1 kết quả", { exact: true })).toBeVisible();
});

test("family focus is readable before the optional tree view", async ({ page }, testInfo) => {
  await page.goto("/gia-pha");
  await expect(page.locator("main > h1")).toHaveText("Cây gia phả");
  await expect(page.getByRole("heading", { name: "Nhánh quanh người đang chọn" })).toBeVisible();
  await page.getByRole("button", { name: "Mở sơ đồ" }).click();
  await expect(page.getByRole("group", { name: "Sơ đồ gia đình minh họa" })).toBeVisible();
  await capture(page, "family-focus", testInfo.project.name);
});

test("calendar and sources preserve uncertainty labels", async ({ page }, testInfo) => {
  await page.goto("/lich-ho");
  await expect(page.getByRole("heading", { name: "Lịch họ & sự kiện" })).toBeVisible();
  await expect(page.getByText("Cần đối chiếu trước khi công bố", { exact: true }).first()).toBeVisible();
  await capture(page, "calendar", testInfo.project.name);

  await page.goto("/tu-lieu");
  await expect(page.getByRole("heading", { name: "Thư viện tư liệu" })).toBeVisible();
  await expect(page.getByText("Nguồn hư cấu · Chỉ phục vụ kiểm thử", { exact: true })).toBeVisible();
  await capture(page, "sources", testInfo.project.name);
});

test("admin preview keeps restricted state explicit", async ({ page }, testInfo) => {
  await page.goto("/quan-tri");
  await expect(page.getByRole("heading", { name: "Tổng quan quản trị" })).toBeVisible();
  await expect(page.getByText("Truy cập bị giới hạn", { exact: true })).toBeVisible();
  await expect(page.getByText("Không có thao tác thay đổi dữ liệu trong bản preview.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập theo lời mời" })).toBeVisible();
  await capture(page, "admin", testInfo.project.name);
});

test("person profile exposes layered tabs and mobile-safe empty states", async ({ page }) => {
  await page.goto("/nguoi/" + demoPersonId);
  await expect(page.locator("#deletion-impact-title")).toBeVisible();
  await expect(page.locator(".deletion-impact-card button")).toBeVisible();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await tabs.nth(1).click();
  await expect(page.getByRole("heading", { name: "Cha mẹ" })).toBeVisible();
  await tabs.nth(2).click();
  await expect(page.getByRole("heading", { name: /Sinh năm/ })).toBeVisible();
  await tabs.nth(4).click();
  await expect(page.getByText("Chưa có tư liệu ảnh", { exact: true })).toBeVisible();
});

test("tree explorer exposes bounded graph modes and fullscreen focus", async ({ page }) => {
  await page.goto("/gia-pha");
  await expect(page.locator("#tree-explorer-title")).toBeVisible();
  await expect(page.locator(".tree-viewport")).toBeVisible();
  await expect(page.locator(".tree-family-list")).toBeVisible();
  await expect(page.getByText(/Đời tương đối:/).first()).toBeVisible();
  const zoomIn = page.locator(".tree-view-controls button").first();
  const zoomReset = page.locator(".tree-view-controls button").nth(1);
  await zoomIn.click();
  await expect(zoomReset).toBeEnabled();
  await zoomReset.click();
  await expect(zoomReset).toBeDisabled();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(3).click();
  await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "true");
  const capSelect = page.locator(".tree-toolbar select").nth(1);
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expect(capSelect).toHaveValue("300");
  } else {
    await expect(capSelect).toHaveValue("120");
    await expect(capSelect.locator('option[value="300"]')).toHaveCount(0);
  }
  const collapseToggle = page.locator(".tree-collapse-toggle");
  await expect(collapseToggle).toHaveAttribute("aria-pressed", "false");
  await collapseToggle.click();
  await expect(collapseToggle).toHaveAttribute("aria-pressed", "true");
  await collapseToggle.click();
  await expect(collapseToggle).toHaveAttribute("aria-pressed", "false");
  const fullscreenToggle = page.locator(".tree-explorer-header button");
  await fullscreenToggle.click();
  await expect(page.locator(".tree-explorer-fullscreen")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tree-explorer-fullscreen")).toHaveCount(0);
});

test("kinship finder exposes bounded permission-aware paths", async ({ page }, testInfo) => {
  await page.goto("/quan-he");
  await expect(page.getByRole("heading", { name: /Đường nối giữa hai người/ })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(2);
  await page.getByRole("button", { name: "Tính đường quan hệ" }).click();
  await expect(page.getByRole("heading", { name: /Đường 1/ })).toBeVisible();
  await expect(page.getByText("Không tự suy ra cách xưng hô", { exact: false })).toBeVisible();
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

  const primaryTargets = await page.locator("button, .button-primary, .button-secondary").evaluateAll((elements) => elements.every((element) => {
    if (getComputedStyle(element).display === "none") return true;
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
  await expect(page.getByText("Thông tin về gia phả và vai trò sẽ chỉ hiển thị sau khi máy chủ xác thực đúng tài khoản.", { exact: false })).toBeVisible();
  await expect(page.locator("button[type=submit]")).toBeDisabled();
  expect(await page.locator("main").innerText()).not.toContain(token);
});
test("MFA setup stays restricted until a member session is present", async ({ page }) => {
  await page.goto("/thiet-lap-mfa");
  await expect(page.getByRole("heading", { name: "Thiết lập xác thực bổ sung" })).toBeVisible();
  await expect(page.getByText("Cần đăng nhập", { exact: true })).toBeVisible();
});
test("account page exposes a clear mobile logout action", async ({ page }) => {
  await page.goto("/them");
  await expect(page.getByRole("heading", { name: "Phiên hiện tại" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  await expect(page.getByText("Đăng xuất sẽ kết thúc phiên", { exact: false })).toBeVisible();
});


test("membership administration exposes restricted state without a session", async ({ page }) => {
  await page.goto("/quan-tri/thanh-vien");
  await expect(page.locator("main > h1")).toBeVisible();
  await expect(page.locator(".admin-restricted")).toBeVisible();
});

test("import intake keeps demo-only safeguards and remains mobile-sized without capability", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/quan-tri/nhap-lieu");
  await expect(page.locator(".import-page h1")).toBeVisible();
  await expect(page.getByLabel("Cây gia phả được cấp quyền")).toBeDisabled();
  await expect(page.getByLabel("Tệp JSON · tối đa 10 MiB")).toBeVisible();
  await expect(page.getByText(/Dữ liệu thật đang bị khóa/)).toBeVisible();
  await expect(page.locator(".import-form [role=alert]")).toContainText("verified session");
  await expect(page.locator(".import-form [role=alert]")).toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const previewResponse = await page.request.get("/api/v1/imports/00000000-0000-4000-8000-000000000099/preview");
  expect(previewResponse.status()).toBe(401);
  expect(await previewResponse.text()).not.toContain("sampleRows");
  await page.getByLabel("Định dạng").selectOption("csv");
  await expect(page.getByLabel("Tiêu đề cột mã nguồn")).toBeVisible();
  await expect(page.getByLabel("Cách diễn giải ngày mơ hồ")).toBeVisible();
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
