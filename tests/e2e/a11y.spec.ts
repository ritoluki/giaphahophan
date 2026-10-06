import axe from "axe-core";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/tra-cuu", "/gia-pha", "/lich-ho", "/tu-lieu"];
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const route of publicRoutes) {
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
