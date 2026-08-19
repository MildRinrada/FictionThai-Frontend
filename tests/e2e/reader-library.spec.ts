import { expect, test } from "@playwright/test";

/**
 * Reader & Library journeys (docs/15 §33, Phase 3).
 *
 * Guest-first reading and the authentication boundary of the personal library
 * run unconditionally. The content journeys need a PUBLISHED fiction, which
 * requires a verified author - so they read the slug of a pre-seeded fiction
 * from PLAYWRIGHT_SEED_NOVEL and skip cleanly when it is not provided.
 *
 * Seed one with the API before running (register → verify → create → publish),
 * then:  PLAYWRIGHT_SEED_NOVEL=<slug> npx playwright test
 */

const SEED_NOVEL = process.env.PLAYWRIGHT_SEED_NOVEL;

test.describe("library authentication boundary", () => {
  test("guest is offered sign-in instead of an empty library", async ({ page }) => {
    await page.goto("/library");

    // The redirect is UX; the API's RequireAuth is the enforcement. Intent is
    // preserved through the next parameter (docs/02 §5.2).
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary|\/login\?next=\/library/);
  });
});

test.describe("missing fiction", () => {
  // KNOWN LIMITATION: the assertion is on the rendered 404 UI, not the HTTP
  // status. The root app/loading.tsx suspense boundary streams the shell (and
  // commits a 200) before a dynamic page can throw notFound(). The fix is to
  // scope that loading boundary to the authenticated sections; until then, a
  // missing fiction answers 200 with the not-found page.
  test("an unknown fiction shows the 404 page, not an error screen", async ({ page }) => {
    await page.goto("/novel/this-fiction-does-not-exist");
    await expect(page.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
    await expect(page.getByRole("link", { name: "กลับสู่หน้าแรก" })).toBeVisible();
  });

  test("an unknown chapter shows the 404 page", async ({ page }) => {
    await page.goto("/read/no-such-novel/no-such-chapter");
    await expect(page.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
  });
});

test.describe("guest reading", () => {
  test.skip(!SEED_NOVEL, "PLAYWRIGHT_SEED_NOVEL is not set; seed a published fiction first");

  test("reads a published fiction from its page to a chapter", async ({ page }) => {
    await page.goto(`/novel/${SEED_NOVEL}`);

    // The fiction page renders for a guest with no sign-in wall (docs/11 §12).
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("link", { name: "เริ่มอ่าน" })).toBeVisible();
    await expect(page.getByRole("button", { name: "บันทึกเข้าคลัง" })).toBeVisible();

    await page.getByRole("link", { name: "เริ่มอ่าน" }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${SEED_NOVEL}/`));

    // The chapter body is on the page - real content, not a shell.
    await expect(page.locator("main")).toContainText("ฝน");
  });

  test("remembers a guest's place on this device", async ({ page }) => {
    await page.goto(`/novel/${SEED_NOVEL}`);
    await page.getByRole("link", { name: "เริ่มอ่าน" }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${SEED_NOVEL}/`));

    // The tracker records the position locally for guests (docs/03 §11) -
    // no account, no server write.
    await page.waitForFunction(() =>
      Object.keys(window.localStorage).some((key) => key.startsWith("ft:progress:")),
    );

    await page.goto(`/novel/${SEED_NOVEL}`);
    await expect(page.getByRole("link", { name: "อ่านต่อ" })).toBeVisible();
  });

  test("bookmarking as a guest routes to sign-in with intent preserved", async ({ page }) => {
    await page.goto(`/novel/${SEED_NOVEL}`);

    await page.getByRole("button", { name: "บันทึกเข้าคลัง" }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("the reader has no horizontal overflow on mobile", async ({ page }) => {
    await page.goto(`/novel/${SEED_NOVEL}`);
    await page.getByRole("link", { name: "เริ่มอ่าน" }).click();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
