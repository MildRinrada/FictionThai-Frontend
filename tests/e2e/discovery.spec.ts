import { expect, test } from "@playwright/test";

/**
 * Discovery journeys (Phase 4 - docs/03 §8, §9).
 *
 * Explore and search are guest-first surfaces; everything here runs without an
 * account. The result-bearing journeys need published fiction and read a known
 * search term from PLAYWRIGHT_SEED_QUERY (a string that matches at least one
 * published fiction); they skip cleanly when it is not provided.
 */

const SEED_QUERY = process.env.PLAYWRIGHT_SEED_QUERY;

test.describe("explore", () => {
  test("renders for a guest with genre categories from the API", async ({ page }) => {
    await page.goto("/explore");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "สำรวจนิยาย" })).toBeVisible();

    // The controlled vocabulary is seeded with the documented genres
    // (docs/08 §14.1), served by the API - never hard-coded in the page.
    // exact: a fiction card whose genre row mentions Fantasy must not match.
    const categories = page.getByRole("link", { name: "Fantasy", exact: true });
    await expect(categories).toBeVisible();
    await expect(categories).toHaveAttribute("href", /\/search\?genre=fantasy/);
  });

  test("has no horizontal overflow on mobile", async ({ page }) => {
    await page.goto("/explore");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});

test.describe("search", () => {
  test("prompts for input rather than dumping everything", async ({ page }) => {
    await page.goto("/search");

    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.getByText("พิมพ์คำค้นหา หรือเลือกตัวกรอง เพื่อเริ่มค้นหา")).toBeVisible();
  });

  test("reports an empty result honestly", async ({ page }) => {
    await page.goto("/search?q=คำที่ไม่มีทางพบเจอแน่นอน12345");

    await expect(page.getByText("ไม่พบนิยายที่ตรงกับคำค้นหา")).toBeVisible();
  });

  test("a genre chip lands on a filtered, shareable URL", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("link", { name: "Fantasy", exact: true }).click();

    // The URL carries the filter (docs/09 §11): the page is linkable state.
    await expect(page).toHaveURL(/\/search\?genre=fantasy/);
    await expect(page.getByRole("search")).toBeVisible();
  });
});

test.describe("search results", () => {
  test.skip(!SEED_QUERY, "PLAYWRIGHT_SEED_QUERY is not set; seed a published fiction first");

  test("finds seeded fiction and links through to its page", async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent(SEED_QUERY!)}`);

    const results = page.getByRole("region", { name: "ผลการค้นหา" });
    await expect(results).toBeVisible();

    // A result card opens the fiction page - search is a way IN, not a list.
    await results.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/novel\//);
  });

  test("search works from the form like a reader would use it", async ({ page }) => {
    await page.goto("/search");

    await page.getByRole("searchbox").fill(SEED_QUERY!);
    await page.getByRole("button", { name: "ค้นหา" }).click();

    await expect(page.getByRole("region", { name: "ผลการค้นหา" })).toBeVisible();
  });
});
