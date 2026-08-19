import { expect, test, type Page } from "@playwright/test";

/**
 * Community journeys (docs/15 §33, Phase 7): the public feed, the post
 * lifecycle, discussion, and reactions.
 *
 * Community needs no seeded fiction - every journey registers its own
 * throwaway account through the real UI, so this suite runs unconditionally.
 */

/** Registers a fresh account through the real registration flow. */
async function registerFreshAccount(page: Page, prefix: string): Promise<string> {
  const suffix = `${Date.now() % 1_000_000_000}${Math.floor(Math.random() * 1000)}`;
  const username = `${prefix}${suffix}`;
  await page.goto("/register");
  await page.getByLabel(/ชื่อผู้ใช้/).fill(username);
  await page.getByLabel(/อีเมล/).fill(`${username}@example.com`);
  await page.getByLabel(/^รหัสผ่าน/).fill("correct horse battery staple");
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect(page).not.toHaveURL(/\/register/);
  return username;
}

test.describe("guest access", () => {
  test("browses the community feed without signing in", async ({ page }) => {
    await page.goto("/community");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "ชุมชน" })).toBeVisible();
    // Feed tabs and the composer entry point are present. `.first()` because
    // the empty-state body may offer a second "เขียนโพสต์" link.
    await expect(page.getByRole("link", { name: "กำลังติดตาม" })).toBeVisible();
    await expect(page.getByRole("link", { name: "เขียนโพสต์" }).first()).toBeVisible();
  });

  test("composing requires sign-in, with intent preserved", async ({ page }) => {
    await page.goto("/community/create");
    await expect(page).toHaveURL(/\/login\?next=%2Fcommunity%2Fcreate|\/login\?next=\/community\/create/);
  });

  test("the following feed requires sign-in", async ({ page }) => {
    await page.goto("/community?feed=following");
    await expect(page).toHaveURL(/\/login/);
  });

  test("has no horizontal overflow on mobile", async ({ page }) => {
    await page.goto("/community");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("post lifecycle", () => {
  // One registration drives the whole signed-in journey: the Auth tier's
  // rate limit is deliberately strict (docs/10 §38), and a test suite that
  // registers an account per assertion trips it when both browser projects
  // run at once.
  test("creates, discusses, reacts, edits, and deletes through the real UI", async ({ page }) => {
    await registerFreshAccount(page, "e2eposter");

    // Create from the documented /community/create route.
    await page.goto("/community/create");
    const message = `ทดสอบโพสต์ชุมชน ${Date.now() % 1_000_000}`;
    await page.getByLabel("เนื้อหาโพสต์").fill(message);
    await page.getByRole("button", { name: "โพสต์" }).click();

    // Lands on the post page with owner controls (hydrated after the
    // client-side ownership check).
    await expect(page).toHaveURL(/\/community\/post\//);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole("button", { name: "แก้ไขโพสต์" })).toBeVisible();

    // React, then take it back - the toggle reflects both states. Between
    // the clicks, wait for the SERVER's count to land (the button ignores
    // clicks while its previous mutation is still in flight, by design), so
    // the second click is never swallowed by the busy guard.
    const likeButton = page.getByRole("button", { name: /ถูกใจ/ });
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true");
    await expect(likeButton).toHaveText(/ถูกใจ 1/);
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "false");

    // Comment on the post; it appears without a reload and survives one.
    const commentText = `ความคิดเห็นแรก ${Date.now() % 1_000_000}`;
    await page.getByPlaceholder("ร่วมพูดคุยในโพสต์นี้…").fill(commentText);
    await page.getByRole("button", { name: "ส่งความคิดเห็น" }).click();
    await expect(page.getByText(commentText)).toBeVisible();
    await page.reload();
    await expect(page.getByText(commentText)).toBeVisible();

    // Edit in place.
    await page.getByRole("button", { name: "แก้ไขโพสต์" }).click();
    await page.getByLabel("เนื้อหาโพสต์").fill(`${message} (แก้ไข)`);
    await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    await expect(page.getByText(`${message} (แก้ไข)`)).toBeVisible();

    // Delete returns to the feed, and the post is gone from it.
    await page.getByRole("button", { name: "ลบโพสต์" }).click();
    await expect(page).toHaveURL(/\/community$/);
    await expect(page.getByText(`${message} (แก้ไข)`)).not.toBeVisible();
  });

  test("another user cannot see edit controls on someone else's post", async ({ browser }) => {
    // User A posts.
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await registerFreshAccount(pageA, "e2eowner");
    await pageA.goto("/community/create");
    const message = `โพสต์ของเจ้าของ ${Date.now() % 1_000_000}`;
    await pageA.getByLabel("เนื้อหาโพสต์").fill(message);
    await pageA.getByRole("button", { name: "โพสต์" }).click();
    await expect(pageA).toHaveURL(/\/community\/post\//);
    const postUrl = pageA.url();
    await contextA.close();

    // User B opens the same post: readable, but no owner controls anywhere.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await registerFreshAccount(pageB, "e2evisitor");
    await pageB.goto(postUrl);
    await expect(pageB.getByText(message)).toBeVisible();
    await expect(pageB.getByRole("button", { name: "แก้ไขโพสต์" })).not.toBeVisible();
    await expect(pageB.getByRole("button", { name: "ลบโพสต์" })).not.toBeVisible();
    await contextB.close();
  });
});
