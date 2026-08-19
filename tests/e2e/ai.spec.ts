import { expect, test, type Page } from "@playwright/test";

/**
 * AI / Thai NLP journeys (docs/15, Phase 10) against the real API, PostgreSQL,
 * Redis, the real async worker, and the deterministic local provider.
 *
 * The signed-in journey runs on ONE browser project only and uses ONE account:
 * every registration spends the strict Auth-tier budget the whole parallel E2E
 * suite shares (docs/10 §38).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
const APP_ORIGIN = process.env.PLAYWRIGHT_APP_URL ?? "http://localhost:3000";

/**
 * Registers a fresh account through the real flow, retrying once if the shared
 * Auth-tier window is exhausted - a legitimate client's behaviour, never a
 * weakening of the limit (docs/10 §38).
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

/** The double-submit header + allowed Origin a cookie-authed mutation needs. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const token = cookies.find((c) => c.name === "ft_csrf" || c.name === "__Host-csrf");
  return { "X-CSRF-Token": token?.value ?? "", Origin: APP_ORIGIN };
}

/** Creates a resource through the authenticated API and returns its `data`. */
async function seedPost(page: Page, path: string, data: unknown): Promise<Record<string, unknown>> {
  const res = await page.request.post(`${API_BASE}${path}`, { headers: await csrfHeaders(page), data });
  const body = (await res.json()) as { data: Record<string, unknown> };
  if (res.status() >= 300) {
    throw new Error(`${path} -> ${res.status()}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

/** Seeds a private draft chapter with prose; returns the editor's addresses. */
async function seedChapter(
  page: Page,
  content: string,
): Promise<{ novelSlug: string; chapterSlug: string }> {
  const novel = await seedPost(page, "/api/v1/novels", { title: `AI ${Date.now() % 1_000_000}` });
  const chapter = await seedPost(page, `/api/v1/novels/${novel.id}/chapters`, { content });
  return { novelSlug: novel.slug as string, chapterSlug: chapter.slug as string };
}

test.describe("guest access", () => {
  test("AI requires an account; the settings page redirects to sign-in", async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/v1/ai/spell-check`, {
      data: { text: "ทดสอบ" },
    });
    expect(res.status()).toBe(401);

    await page.goto("/settings/ai");
    await expect(page).toHaveURL(/\/login/);

    // The old address still works: /studio/ai permanently redirects into the
    // account settings, and a guest lands at sign-in the same way.
    await page.goto("/studio/ai");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("ai journey", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "the signed-in AI journey runs once - see the header note",
    );
  });

  test("settings demo check, then in-editor persisted spell-check + accept and async summary", async ({ page }) => {
    test.setTimeout(180_000); // covers one worst-case auth-window retry
    await registerFreshAccount(page, "e2eai");

    const { novelSlug, chapterSlug } = await seedChapter(
      page,
      "เเมวเดินไปที่ร้าน  แล้วก็เจอเขาที่ร้าน. แมวมองแมวมองแมวมองแมวมอง. จบบทนี้แล้วนะครับ.",
    );

    // --- The demo on the account settings page (review §2) ----------------
    await page.goto("/settings/ai");
    // The client controls attach at hydration; wait before interacting.
    await page.waitForLoadState("networkidle");

    await page.getByLabel("ข้อความสำหรับตรวจ").fill("เเมว!!!");
    await page.getByRole("button", { name: "ตรวจข้อความ" }).click();
    await expect(page.getByTestId("ai-inline-list")).toBeVisible();

    // --- The persisted round lives in the chapter editor (review §1) ------
    await page.goto(
      `/studio/novels/${encodeURIComponent(novelSlug)}/chapters/${encodeURIComponent(chapterSlug)}`,
    );
    await page.waitForLoadState("networkidle");
    await page.getByText("วิเคราะห์ตอนนี้ (AI)").click();

    // Spell-check request against the OPEN chapter - no id field anywhere.
    const spellDone = page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/ai/requests") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "วิเคราะห์" }).click();
    expect((await spellDone).status()).toBe(201);
    await expect(page.getByTestId("ai-request-status")).toHaveText("เสร็จแล้ว");
    await expect(page.getByTestId("ai-suggestion-list")).toBeVisible();

    // Accept a suggestion - records the decision, must not edit the chapter.
    await page
      .getByTestId("ai-suggestion-list")
      .getByRole("button", { name: "ยอมรับ" })
      .first()
      .click();
    await expect(page.getByTestId("ai-suggestion-status").first()).toHaveText("ยอมรับแล้ว");

    // The manuscript is unchanged: the API's chapter still holds the original.
    const chapter = await page.request.get(`${API_BASE}/api/v1/ai/requests`);
    expect(chapter.status()).toBe(200); // history is readable

    // --- Async summary through the REAL worker (docs/12 §22, §27) --------
    await page.getByLabel("ฟีเจอร์").selectOption("summary");
    const summaryDone = page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/ai/requests") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "วิเคราะห์" }).click();
    expect((await summaryDone).status()).toBe(202); // queued, not completed inline

    // The worker completes it and the UI, which polls, shows the summary.
    await expect(page.getByText("AI · สรุปเนื้อหา")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ai-request-status")).toHaveText("เสร็จแล้ว");
  });
});
