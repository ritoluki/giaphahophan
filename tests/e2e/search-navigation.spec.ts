import { expect, test, type Page } from "@playwright/test";

const personId = "0e6ee4e5-9816-52b8-bc8b-33d7c79efe9c";
const branchId = "4c4b04f5-db79-536c-b681-fa55ee77917e";
const query = "Phan Đức An ";

async function expectSearchUrl(page: Page, filters: { branchId: string | null; lifeStatus: string | null; birthYear: string | null }) {
  await expect.poll(() => {
    const url = new URL(page.url());
    return {
      pathname: url.pathname,
      query: url.searchParams.get("q"),
      branchId: url.searchParams.get("branchId"),
      lifeStatus: url.searchParams.get("lifeStatus"),
      birthYear: url.searchParams.get("birthYear")
    };
  }).toEqual({ pathname: "/tra-cuu", query, ...filters });
}

test("search preserves accented typing, applied filters, reload and Back navigation", async ({ page }) => {
  await page.goto("/tra-cuu");
  const search = page.getByLabel("Tìm người", { exact: true });
  const filters = page.locator(".search-filters");
  const summary = filters.locator("summary");
  const person = page.locator(".person-result").filter({ hasText: "Phan Đức An" });
  const noFilters = { branchId: null, lifeStatus: null, birthYear: null };
  const appliedFilters = { branchId, lifeStatus: "deceased", birthYear: "1870" };

  await search.pressSequentially(query, { delay: 15 });
  await expect(search).toHaveValue(query);
  await expect(search).toBeFocused();
  await expectSearchUrl(page, noFilters);
  await expect(person).toHaveAttribute("href", "/nguoi/" + personId);

  await summary.click();
  await page.getByRole("combobox", { name: "Chi họ", exact: true }).selectOption(branchId);
  await page.getByRole("combobox", { name: "Tình trạng", exact: true }).selectOption("deceased");
  await page.getByLabel("Năm sinh", { exact: true }).fill("1870");
  await expectSearchUrl(page, noFilters);
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(filters).toHaveJSProperty("open", false);
  await expect(summary).toBeFocused();
  await expectSearchUrl(page, appliedFilters);
  await expect(person).toHaveAttribute("href", "/nguoi/" + personId);

  await page.reload();
  await expect(search).toHaveValue(query);
  await expectSearchUrl(page, appliedFilters);
  await expect(person).toHaveAttribute("href", "/nguoi/" + personId);
  await summary.click();
  await expect(page.getByRole("combobox", { name: "Chi họ", exact: true })).toHaveValue(branchId);
  await expect(page.getByRole("combobox", { name: "Tình trạng", exact: true })).toHaveValue("deceased");
  await expect(page.getByLabel("Năm sinh", { exact: true })).toHaveValue("1870");

  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await expect(filters).toHaveJSProperty("open", false);
  await expect(summary).toBeFocused();
  await expectSearchUrl(page, noFilters);
  await expect(search).toHaveValue(query);

  await page.goBack();
  await expectSearchUrl(page, appliedFilters);
  await expect(search).toHaveValue(query);
  await summary.click();
  await expect(page.getByRole("combobox", { name: "Chi họ", exact: true })).toHaveValue(branchId);
  await expect(page.getByRole("combobox", { name: "Tình trạng", exact: true })).toHaveValue("deceased");
  await expect(page.getByLabel("Năm sinh", { exact: true })).toHaveValue("1870");
  await expect(person).toHaveAttribute("href", "/nguoi/" + personId);
});
