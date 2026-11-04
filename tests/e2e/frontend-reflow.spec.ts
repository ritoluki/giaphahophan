import { expect, test } from "@playwright/test";

const person = "0e6ee4e5-9816-52b8-bc8b-33d7c79efe9c";
const routes = ["/", "/gioi-thieu", "/tra-cuu", "/gia-pha", `/gia-pha?root=${person}`, `/nguoi/${person}`, "/quan-he", "/lich-ho", "/tu-lieu", "/them", "/dong-gop/moi", "/quy-ho", "/khuyen-hoc", "/tin-ho", "/tin-ho/giu-gin-nguon-coi", "/dia-diem", "/dia-diem/a3500000-0000-4000-8000-000000000001", "/quan-tri", "/quan-tri/khuyen-hoc", "/quan-tri/thanh-vien", "/quan-tri/nhap-lieu", "/quan-tri/xuat-lieu", "/dang-nhap", "/quen-mat-khau", "/thiet-lap-mfa"];

for (const width of [320, 360, 390, 412, 768, 1440]) {
  test(`reading and working screens reflow at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.getByRole("main"), route).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);
      const layout = await page.evaluate(() => {
        const visible = (element: Element) => element.checkVisibility();
        return {
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
          smallFields: [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")].filter(visible).filter((element) => parseFloat(getComputedStyle(element).fontSize) < 16).map((element) => element.outerHTML.slice(0, 160)),
          smallActions: [...document.querySelectorAll(".button-primary, .button-secondary, .bottom-nav a, main button")].filter(visible).filter((element) => element.getBoundingClientRect().height < 47.5).map((element) => ({ text: element.textContent, height: element.getBoundingClientRect().height })),
        };
      });
      expect.soft(layout, `${width}px ${route}`).toEqual({ overflow: 0, smallFields: [], smallActions: [] });
      // The last item remains scrollable above the fixed phone navigation.
      if (width < 1024) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const covered = await page.evaluate(() => {
          const navigation = document.querySelector(".bottom-nav");
          const main = document.querySelector("main");
          if (!navigation || !main || !navigation.getClientRects().length) return false;
          const last = [...main.querySelectorAll("a, button, p, article")].filter((element) => element.checkVisibility()).at(-1);
          return last ? last.getBoundingClientRect().bottom > navigation.getBoundingClientRect().top + 1 : false;
        });
        expect.soft(covered, `bottom navigation covers final content: ${route}`).toBe(false);
      }
    }
  });
}

test("reading screens keep long Vietnamese names at an emulated 200 percent browser zoom", async ({ browser }) => {
  test.setTimeout(90_000);
  // 768 × 1000 physical pixels at 200%: 384 × 500 CSS pixels.
  // Reflow uses the reduced CSS viewport, as browser zoom does, rather than CSS zoom (which keeps media queries unchanged).
  const context = await browser.newContext({ viewport: { width: 384, height: 500 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  for (const route of ["/", "/tra-cuu", `/nguoi/${person}`, `/gia-pha?root=${person}`, "/quan-tri/nhap-lieu", "/dang-nhap"]) {
    await page.goto(`${test.info().project.use.baseURL}${route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.querySelectorAll(".family-person-description :is(h3,h4), .profile-heading h1, .person-result strong").forEach((element) => {
        element.textContent = "Phan Nguyễn Hoàng Thị Minh Phương (tên hư cấu để kiểm tra xuống dòng)";
      });
    });
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1), `200% ${route}`).toBe(true);
    const clippedNames = await page.locator(".family-person-description :is(h3,h4), .profile-heading h1, .person-result strong").evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1 || getComputedStyle(element).textOverflow === "ellipsis").length);
    expect(clippedNames, route).toBe(0);
  }
  await context.close();
});
