import { execSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * Moderation journeys (docs/15 §33, Phase 8): a user reports content, a
 * moderator works the queue, the target's state actually changes, the audit
 * record is visible, and the staff surface stays closed to everyone else.
 *
 * The signed-in journeys run on ONE browser project only: they prove server
 * behaviour that does not vary by viewport, and each registration spends the
 * deliberately strict Auth-tier rate budget (docs/10 §38) that the whole E2E
 * suite shares. Guest checks run on both projects.
 */

/**
 * Registers a fresh account through the real registration flow. If the
 * shared Auth-tier window is exhausted (429), it waits for the next window
 * and retries once - a legitimate client's behaviour, never a weakening of
 * the limit (docs/10 §38).
 */
async function registerFreshAccount(page: Page, prefix: string): Promise<string> {
  const suffix = `${Date.now() % 1_000_000_000}${Math.floor(Math.random() * 1000)}`;
  const username = `${prefix}${suffix}`;
  await page.goto("/register");
  await page.getByLabel(/ชื่อผู้ใช้/).fill(username);
  await page.getByLabel(/อีเมล/).fill(`${username}@example.com`);
  await page.getByLabel(/^รหัสผ่าน/).fill("correct horse battery staple");
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  try {
    await expect(page).not.toHaveURL(/\/register/, { timeout: 8_000 });
  } catch {
    await page.waitForTimeout(61_000);
    await page.getByRole("button", { name: "สร้างบัญชี" }).click();
    await expect(page).not.toHaveURL(/\/register/);
  }
  return username;
}

/**
 * Promotes an account to moderator directly in the database. Role changes are
 * deliberately NOT an API (docs/08 §6.1), so the test does what an operator
 * would. The username comes from our own generator (alphanumeric only).
 */
function promoteToModerator(username: string): void {
  execSync(
    `docker compose -f ../infrastructure/docker/docker-compose.yml exec -T postgres ` +
      `psql -U fictionthai -d fictionthai -c "UPDATE users SET role='moderator' WHERE username='${username}'"`,
    { stdio: "pipe" },
  );
}

test.describe("guest access", () => {
  test("the moderation queue requires sign-in", async ({ page }) => {
    await page.goto("/admin/moderation");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the admin page has no horizontal overflow on mobile", async ({ page }) => {
    // The login redirect target is what a guest actually sees.
    await page.goto("/admin/moderation");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("report and moderate", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "signed-in moderation journeys run once - see the header note",
    );
  });

  // ONE journey covering both sides of moderation. Consolidated on purpose:
  // every registration spends the deliberately strict Auth-tier budget the
  // whole parallel E2E suite shares (docs/10 §38), so this spec uses exactly
  // two accounts - the reporter (who is also the proof that a normal user
  // cannot reach the staff surface) and the moderator.
  test("a user reports content and a moderator works it end to end: queue → action → state change → audit → close", async ({
    browser,
  }) => {
    test.setTimeout(240_000); // covers worst-case auth-window retries
    // --- The reporter: posts, reports, and is refused at the staff door ---
    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    await registerFreshAccount(reporterPage, "e2evictim");
    await reporterPage.goto("/community/create");
    const message = `โพสต์ผิดกติกา ${Date.now() % 1_000_000}`;
    await reporterPage.getByLabel("เนื้อหาโพสต์").fill(message);
    await reporterPage.getByRole("button", { name: "โพสต์" }).click();
    await expect(reporterPage).toHaveURL(/\/community\/post\//);
    const postUrl = reporterPage.url();

    // The docs/02 §38 flow: report → select reason → describe → submit →
    // a simple confirmation with no moderation internals.
    const detailMark = `e2e-mark-${Date.now() % 1_000_000}`;
    await reporterPage.getByRole("button", { name: /รายงาน/ }).click();
    await expect(reporterPage.getByRole("dialog")).toBeVisible();
    await reporterPage.getByLabel("สแปม", { exact: true }).check();
    await reporterPage.getByLabel(/รายละเอียดเพิ่มเติม/).fill(detailMark);
    await reporterPage.getByRole("button", { name: "ส่งรายงาน" }).click();
    await expect(reporterPage.getByText(/รายงานแล้ว/)).toBeVisible();

    // The same (normal) account gets the API's refusal on the staff surface -
    // the backend is the boundary, the page just renders it (docs/09 §29).
    await reporterPage.goto("/admin/moderation");
    await expect(
      reporterPage.getByText("หน้านี้สำหรับทีมดูแลเท่านั้น"),
    ).toBeVisible();
    await reporterContext.close();

    // --- The moderator ----------------------------------------------------
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();
    const modName = await registerFreshAccount(modPage, "e2emod");
    promoteToModerator(modName);

    // The queue holds the report (oldest first; walk pages if earlier runs
    // left older pending reports behind).
    await modPage.goto("/admin/moderation");
    const row = modPage.getByRole("link").filter({ hasText: detailMark });
    for (let hop = 0; hop < 6 && (await row.count()) === 0; hop += 1) {
      const next = modPage.getByRole("button", { name: "ถัดไป →" });
      if ((await next.count()) === 0 || (await next.isDisabled())) break;
      await next.click();
      await modPage.waitForTimeout(300);
    }
    await expect(row).toBeVisible();
    await row.click();

    // The detail shows the reported content and its live state.
    await expect(modPage.getByText(detailMark)).toBeVisible();
    await expect(modPage.getByText(message)).toBeVisible();

    // Perform the hide action (the target's first available action).
    await modPage.getByLabel("เลือกการดำเนินการ").selectOption("hide");
    await modPage.getByRole("button", { name: "ดำเนินการ", exact: true }).click();
    await expect(modPage.getByText("บันทึกการดำเนินการแล้ว")).toBeVisible();

    // The audit record is visible in the history panel, attributed.
    const history = modPage.getByRole("region", { name: "ประวัติการดำเนินการ" });
    await expect(history.getByText("ซ่อน")).toBeVisible();
    await expect(history.getByText(`@${modName}`)).toBeVisible();
    // …and the live snapshot now says hidden.
    await expect(modPage.getByText(/สถานะปัจจุบัน/)).toContainText("hidden");

    // The target's state ACTUALLY changed: the API now answers 404 for the
    // post, for guests included. Asserted against the API itself because the
    // public post PAGE is deliberately cached for up to 30s (docs/14 §7) and
    // may serve the pre-hide render until it revalidates.
    const postId = postUrl.split("/").pop() ?? "";
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
    const gone = await modPage.request.get(
      `${apiBase}/api/v1/community/posts/${postId}`,
      { headers: {} },
    );
    expect(gone.status()).toBe(404);

    // Close the report as handled; it leaves the pending queue.
    await modPage.getByRole("button", { name: "ปิดรายงาน - ดำเนินการแล้ว" }).click();
    await expect(modPage.getByText("ดำเนินการแล้ว", { exact: true })).toBeVisible();

    await modPage.goto("/admin/moderation");
    await expect(
      modPage.getByRole("link").filter({ hasText: detailMark }),
    ).toHaveCount(0);

    await modContext.close();
  });
});
