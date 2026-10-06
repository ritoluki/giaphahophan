import axe from "axe-core";
import { expect, test } from "@playwright/test";

const scanRoutes = [
  "/",
  "/tra-cuu",
  "/gia-pha",
  "/lich-ho",
  "/tu-lieu",
  "/quan-tri/xuat-lieu",
  "/quan-tri/nhap-lieu",
];
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const route of scanRoutes) {
  test(`keyboard skip navigation ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const main = page.getByRole("main");
    const skipLink = page.getByRole("link", { name: "Bỏ qua đến nội dung" });

    await expect(main).toHaveCount(1);
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await expect(main).toBeFocused();
  });

  test(`WCAG accessibility scan ${route}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async (tags) => {
      const results = await window.axe.run(document, {
        runOnly: { type: "tag", values: tags },
      });
      return results.violations.map(({ id, impact, help, nodes }) => ({
        id,
        impact,
        help,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      }));
    }, wcagTags);

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
}
