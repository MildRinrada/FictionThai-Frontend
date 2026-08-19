import { expect, test } from "@playwright/test";

/**
 * Guest access smoke tests.
 *
 * Guest-first is a core product principle, not a nice-to-have: docs/10 §2.1 and
 * docs/15 §18 require that a visitor can reach public content with no account.
 * These run against the real frontend and API.
 *
 * As reader, discovery, and writer flows are implemented, extend this directory
 * with the journeys listed in docs/15 §33.
 */

test.describe("guest", () => {
  test("can open the site without signing in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "FictionThai" })).toBeVisible();

    // No authentication wall in front of the first useful action (docs/05 §26).
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("the fiction format vocabulary stays three separate dimensions on the wire", async ({ page }) => {
    // The debug region this test once read on the home page is long gone; the
    // contract it protected lives at the API (docs/08 §43 Rule 6): the three
    // dimensions must remain separately identifiable, never one merged enum.
    const res = await page.request.get(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090"}/api/v1/fiction-formats`,
    );
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as {
      data: {
        story_structures: string[];
        presentation_formats: string[];
        content_modes: string[];
      };
    };
    expect(data.story_structures).toEqual(
      expect.arrayContaining(["one_shot", "multi_chapter"]),
    );
    expect(data.presentation_formats).toEqual(
      expect.arrayContaining(["standard", "chat", "headcanon"]),
    );
    expect(data.content_modes).toEqual(
      expect.arrayContaining(["general", "headcanon"]),
    );
  });

  test("renders format badges derived from metadata", async ({ page }) => {
    await page.goto("/");

    // The hero's spotlight card carries the FormatBadges list, and the shelf
    // cards carry their compact format chips - both Thai, like every label on
    // the platform (docs/05 §11).
    const badgeLists = page.getByRole("list", { name: "รูปแบบของนิยาย" });
    await expect(badgeLists.first()).toBeVisible();
    await expect(page.getByText("เฮดแคนอน").first()).toBeVisible();
  });

  test("shows a useful 404 rather than a dead end", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
    await expect(page.getByRole("link", { name: "กลับสู่หน้าแรก" })).toBeVisible();
  });

  test("is usable on a mobile viewport without horizontal scrolling", async ({ page }) => {
    await page.goto("/");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
