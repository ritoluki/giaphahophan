import { expect, test } from "@playwright/test";
import fixture from "../../fixtures/demo-family.json";

const firstPerson = fixture.persons[0]!;
const firstChildLink = fixture.parentLinks.find((link) => link.parentId === firstPerson.id)!;
const firstChild = fixture.persons.find((person) => person.id === firstChildLink.childId)!;
const severalPartners = "da6fe88f-b3cc-5be1-96dd-9c8bf7a65a9c";

test("a relative chooses a person, moves through children and parents, and can go back", async ({ page }) => {
  await page.goto("/gia-pha");
  await expect(page.getByRole("heading", { name: "Bạn muốn xem gia đình của ai?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mở sơ đồ", exact: true })).toHaveCount(0);
  await page.getByLabel("Tìm người trong gia phả").fill("phan duc an");
  await page.getByRole("button", { name: new RegExp(firstPerson.displayName) }).click();
  await expect(page).toHaveURL(new RegExp(`root=${firstPerson.id}`));
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstPerson.displayName}` })).toBeVisible();

  await page.locator(".family-children .family-person-row").filter({ has: page.getByRole("heading", { name: firstChild.displayName, exact: true }) }).getByRole("link", { name: /^Xem gia đình/ }).click();
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstChild.displayName}` })).toBeVisible();
  await page.locator(".family-parents .family-person-row").filter({ has: page.getByRole("heading", { name: firstPerson.displayName, exact: true }) }).getByRole("link", { name: /^Xem gia đình/ }).click();
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstPerson.displayName}` })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstChild.displayName}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstChild.displayName}` })).toBeVisible();
});

test("opening a profile preserves the family, branch, and display choices on return", async ({ page }) => {
  const context = `/gia-pha?root=${firstChild.id}&mode=ancestors&depth=3&branch=${firstChild.branchId}`;
  await page.goto(context);
  await page.locator(".family-person-current").getByRole("link", { name: /^Xem hồ sơ/ }).click();
  await expect(page.getByRole("heading", { name: firstChild.displayName, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "← Trở lại gia phả", exact: true }).click();
  await expect(page).toHaveURL(context);
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstChild.displayName}` })).toBeVisible();
  await page.reload();
  await page.getByText("Tùy chọn", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Chi gia đình" })).toHaveValue(firstChild.branchId!);
  await expect(page.getByRole("combobox", { name: "Phạm vi sơ đồ" })).toHaveValue("ancestors");
  await expect(page.getByRole("combobox", { name: "Số thế hệ trong sơ đồ" })).toHaveValue("3");
});

test("profile opens the chosen person's family rather than a fixed first root", async ({ page }) => {
  await page.goto(`/nguoi/${firstChild.id}`);
  await page.locator(".profile-actions").getByRole("link", { name: "Xem gia đình", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`root=${firstChild.id}`));
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstChild.displayName}` })).toBeVisible();
});

test("the optional diagram draws relationships, summarizes a person, and restores focus after Escape", async ({ page }) => {
  await page.goto(`/gia-pha?root=${firstPerson.id}`);
  const opener = page.getByRole("button", { name: "Mở sơ đồ", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/view=diagram/);
  await expect.poll(async () => dialog.locator(".react-flow__edge-path").count()).toBeGreaterThan(0);
  await expect(dialog.getByRole("button", { name: "Phóng to sơ đồ" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Thu nhỏ sơ đồ" })).toBeVisible();
  await dialog.getByRole("button", { name: "Phóng to sơ đồ" }).click();
  await dialog.getByRole("button", { name: "Về người đang xem", exact: true }).click();
  const url = page.url();
  await dialog.locator(`.react-flow__node[data-id="${firstPerson.id}"] button`).click();
  await expect(dialog.getByRole("region", { name: `Tóm tắt về ${firstPerson.displayName}` })).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(dialog.getByRole("button", { name: "Xem gia đình", exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Xem hồ sơ", exact: true })).toBeVisible();
  await expect.poll(async () => {
    const canvas = await dialog.locator(".family-diagram-canvas").boundingBox();
    const node = await dialog.locator(`.react-flow__node[data-id="${firstPerson.id}"]`).boundingBox();
    return Boolean(canvas && node && node.x >= canvas.x && node.y >= canvas.y && node.x + node.width <= canvas.x + canvas.width && node.y + node.height <= canvas.y + canvas.height);
  }, { message: "The selected person remains fully visible after the summary resizes the canvas" }).toBe(true);
  await page.screenshot({ path: `reports/design-review/frontend-refactor-20261103/diagram-${test.info().project.name}.png` });
  await dialog.getByRole("button", { name: "Đóng thông tin", exact: true }).click();
  await page.keyboard.press("Tab");
  const childButton = dialog.locator(`.react-flow__node[data-id="${firstChild.id}"] button`);
  await expect(childButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("region", { name: `Tóm tắt về ${firstChild.displayName}` })).toBeVisible();
  expect(page.url()).toBe(url);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page).not.toHaveURL(/view=diagram/);
});

test("several partners remain distinct and uncertain relations stay explicit", async ({ page }) => {
  await page.goto(`/gia-pha?root=${severalPartners}`);
  const partnerGroup = page.locator(".family-center > .family-group");
  await expect(partnerGroup.locator(".family-person-row")).toHaveCount(2);
  await expect(partnerGroup.getByText("Đã chia tay hoặc ly thân", { exact: true })).toBeVisible();
  await expect(partnerGroup.getByText("Chưa rõ tình trạng hôn phối", { exact: true })).toBeVisible();

  const disputed = fixture.parentLinks.find((link) => link.status === "disputed")!;
  await page.goto(`/gia-pha?root=${disputed.childId}`);
  await expect(page.locator(".family-parents").getByText(/Cần đối chiếu/)).toBeVisible();
  const adoptive = fixture.parentLinks.find((link) => link.kind === "adoptive")!;
  await page.goto(`/gia-pha?root=${adoptive.childId}`);
  await expect(page.locator(".family-parents").getByText("Cha mẹ nuôi", { exact: true })).toBeVisible();
  const guardian = fixture.parentLinks.find((link) => link.kind === "guardian")!;
  await page.goto(`/gia-pha?root=${guardian.childId}`);
  await expect(page.locator(".family-parents").getByText("Người giám hộ", { exact: true })).toBeVisible();
});

test("invalid URL choices recover to the person chooser and the phone page stays within its viewport", async ({ page }) => {
  await page.goto("/gia-pha?root=not-a-person&view=diagram&mode=invalid&depth=999&branch=unknown");
  await expect(page.getByRole("heading", { name: "Bạn muốn xem gia đình của ai?" })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/occurrence|canonical|projection|revision/iu);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Tìm người trong gia phả").fill(firstPerson.displayName);
  await page.getByRole("button", { name: new RegExp(firstPerson.displayName) }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a browser without layout workers offers a working list fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", { value: class { constructor() { throw new Error("Synthetic unavailable worker"); } } });
  });
  await page.goto(`/gia-pha?root=${firstPerson.id}`);
  await page.getByRole("button", { name: "Mở sơ đồ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Chưa mở được sơ đồ", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Xem bằng danh sách", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: `Gia đình của ${firstPerson.displayName}` })).toBeVisible();
});

test("closing a diagram while it loads does not replace a later person's diagram", async ({ page }) => {
  await page.goto(`/gia-pha?root=${firstPerson.id}`);
  await page.getByRole("button", { name: "Mở sơ đồ", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Đóng sơ đồ", exact: true }).click();
  await page.goto(`/gia-pha?root=${firstChild.id}&view=diagram`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".family-diagram-header p")).toHaveText(firstChild.displayName);
  await expect(dialog.locator(`.react-flow__node[data-id="${firstChild.id}"] .family-diagram-node-current`)).toBeVisible();
  await expect(dialog.locator(".family-diagram-node-current")).toHaveCount(1);
});
