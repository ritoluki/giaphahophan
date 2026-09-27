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
