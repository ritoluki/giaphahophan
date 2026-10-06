import { expect, test } from "@playwright/test";

test("anonymous export workspace is accessible and fails closed without private projection", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/quan-tri/xuat-lieu");

  const workspace = page.getByRole("region", { name: "Khu vực xuất liệu" });
  await expect(workspace).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chưa mở được phạm vi xuất" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  await expect(page.getByLabel("Định dạng xuất")).toHaveCount(0);
  await expect(page.getByTestId("export-preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tệp chưa sẵn sàng" })).toHaveCount(0);
  await expect(page.getByLabel("Khu vực xuất liệu")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 320);
});
