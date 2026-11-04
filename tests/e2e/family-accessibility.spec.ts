import axe from "axe-core";
import { expect, test } from "@playwright/test";

const root = "da6fe88f-b3cc-5be1-96dd-9c8bf7a65a9c";

test("family reading fits each supported phone, tablet, and desktop width", async ({ page }) => {
  for (const width of [320, 360, 390, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/gia-pha?root=${root}`);
    await expect(page.locator(".family-person-current")).toBeVisible();
    // Deliberately exercise a long, synthetic Vietnamese name without changing data.
    await page.locator(".family-person-current h3").evaluate((heading) => { heading.textContent = "Phan Nguyễn Thị Hoài Thương Minh Châu (tên minh họa)"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${width}px`).toBe(true);
    const undersized = await page.locator(".family-browser button, .family-browser a, .family-browser input, .family-browser summary").evaluateAll((controls) => controls.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      return rect.width < 44 || rect.height < 44 ? [{ text: element.textContent, width: rect.width, height: rect.height }] : [];
    }));
    expect(undersized, `Touch targets at ${width}px`).toEqual([]);
    const baseFont = await page.locator(".family-browser").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(baseFont).toBeGreaterThanOrEqual(17);
  }
});

test("family chooser, reading, and real diagram have no axe WCAG violations", async ({ page }) => {
  test.setTimeout(90_000);
  async function scan() {
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  }
  await page.goto("/gia-pha");
  await expect(page.getByLabel("Tìm người trong gia phả")).toBeVisible();
  await scan();
  await page.goto(`/gia-pha?root=${root}`);
  await expect(page.locator(".family-person-current")).toBeVisible();
  await scan();
  await page.getByRole("button", { name: "Mở sơ đồ", exact: true }).click();
  await expect.poll(async () => page.getByRole("dialog").locator(".react-flow__edge-path").count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await scan();
});
