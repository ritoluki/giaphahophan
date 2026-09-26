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

test("family focus is readable before the optional tree view", async ({ page }, testInfo) => {
  await page.goto("/gia-pha");
  await expect(page.getByRole("heading", { name: "Cây gia phả" })).toBeVisible();
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
