import { expect, test } from "@playwright/test";

/**
 * Interaction journeys (docs/15 §33, Phase 6): comments and notifications.
 *
 * The guest-facing behavior runs unconditionally. The signed-in journey -
 * post a comment, see the author notified - needs a published fiction and a
 * throwaway account, so it registers one through the real UI and reads the
 * fiction slug from PLAYWRIGHT_SEED_NOVEL, skipping cleanly when unset.
 */

const SEED_NOVEL = process.env.PLAYWRIGHT_SEED_NOVEL;

test.describe("notifications authentication boundary", () => {
  test("guest is offered sign-in instead of an empty feed", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page).toHaveURL(/\/login\?next=%2Fnotifications|\/login\?next=\/notifications/);
  });
});

test.describe("guest reads the discussion", () => {
  test.skip(!SEED_NOVEL, "PLAYWRIGHT_SEED_NOVEL is not set; seed a published fiction first");

  test("the fiction page shows the comment section without a sign-in wall", async ({ page }) => {
    await page.goto(`/novel/${SEED_NOVEL}`);

    await expect(page).not.toHaveURL(/\/login/);
    const section = page.getByRole("region", { name: /ความคิดเห็น/ });
    await expect(section.getByRole("heading", { name: /ความคิดเห็น/ })).toBeVisible();
    // The write box is present - the API, not a wall, decides at submit time.
    await expect(
      section.getByPlaceholder("แสดงความคิดเห็นถึงเรื่องนี้…"),
    ).toBeVisible();
  });

  test("the reader page carries the chapter thread below the content", async ({ page }) => {
    await page.goto(`/novel/${SEED_NOVEL}`);
    await page.getByRole("link", { name: "เริ่มอ่าน" }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${SEED_NOVEL}/`));

    await expect(
      page.getByPlaceholder("แสดงความคิดเห็นถึงตอนนี้…"),
    ).toBeVisible();
  });

  test("a guest submitting a comment is offered sign-in in place", async ({ page }) => {
    await page.goto(`/novel/${SEED_NOVEL}`);

    const section = page.getByRole("region", { name: /ความคิดเห็น/ });
    await section.getByPlaceholder("แสดงความคิดเห็นถึงเรื่องนี้…").fill("อยากคอมเมนต์");
    await section.getByRole("button", { name: "ส่งความคิดเห็น" }).click();

    // Intent preserved: sign-in offered exactly where the comment was typed.
    await expect(section.getByRole("link", { name: "เข้าสู่ระบบ" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe("signed-in interaction journey", () => {
  test.skip(!SEED_NOVEL, "PLAYWRIGHT_SEED_NOVEL is not set; seed a published fiction first");

  test("registers, comments on the seeded fiction, and sees it live", async ({ page }) => {
    // A fresh throwaway account through the real registration flow. The
    // random tail matters: both browser projects run this test concurrently,
    // and a timestamp alone can collide across them.
    const suffix = `${Date.now() % 1_000_000_000}${Math.floor(Math.random() * 1000)}`;
    await page.goto("/register");
    await page.getByLabel(/ชื่อผู้ใช้/).fill(`e2ereader${suffix}`);
    await page.getByLabel(/อีเมล/).fill(`e2ereader${suffix}@example.com`);
    await page.getByLabel(/^รหัสผ่าน/).fill("correct horse battery staple");
    await page.getByRole("button", { name: /สร้างบัญชี|สมัครสมาชิก/ }).click();
    await expect(page).not.toHaveURL(/\/register/);

    await page.goto(`/novel/${SEED_NOVEL}`);
    const section = page.getByRole("region", { name: /ความคิดเห็น/ });
    const message = `ทดสอบคอมเมนต์ ${suffix}`;

    await section.getByPlaceholder("แสดงความคิดเห็นถึงเรื่องนี้…").fill(message);
    await section.getByRole("button", { name: "ส่งความคิดเห็น" }).click();

    // The comment appears without a reload, with owner affordances.
    await expect(section.getByText(message)).toBeVisible();
    await expect(section.getByRole("button", { name: "ลบ" }).first()).toBeVisible();

    // It also survives a reload - actually persisted, not just local state.
    await page.reload();
    await expect(
      page.getByRole("region", { name: /ความคิดเห็น/ }).getByText(message),
    ).toBeVisible();

    // Leave the seeded data tidy for the next run.
    const region = page.getByRole("region", { name: /ความคิดเห็น/ });
    await region.getByRole("button", { name: "ลบ" }).first().click();
    await expect(region.getByText(message)).not.toBeVisible();

    // The same account doubles as the empty-notification-feed case:
    // commenting notifies the fiction's AUTHOR, never the commenter, so this
    // fresh account has received nothing. One registration, two behaviors -
    // deliberate, because the Auth rate limit is strict (docs/10 §38).
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "การแจ้งเตือน" })).toBeVisible();
    await expect(page.getByText("ยังไม่มีการแจ้งเตือน")).toBeVisible();
  });
});
