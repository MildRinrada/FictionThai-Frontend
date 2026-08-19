import { expect, test, type Page } from "@playwright/test";

/**
 * Premium subscription + writer-donation journeys (Phase 11 + demo mode) against
 * the real API, PostgreSQL, Redis, and the private media store.
 *
 * The backend runs in ONE mode at a time (SUBSCRIPTION_MODE). Rather than assume
 * which, each signed-in journey PROBES the mode from the public pricing endpoint
 * and skips unless it matches - so the same spec validates whichever mode the
 * operator started:
 *
 *   demo  → the free-trial journey (activate → Pro active, no payment).
 *   live  → the paid PromptPay journey (checkout → slip → awaiting verification).
 *
 * The signed-in journeys run on ONE browser project and ONE account - every
 * registration spends the strict Auth-tier budget the whole parallel E2E suite
 * shares (docs/10 §38).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
const APP_ORIGIN = process.env.PLAYWRIGHT_APP_URL ?? "http://localhost:3000";

// A complete, valid 1×1 PNG for the payment-slip upload.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function subscriptionMode(page: Page): Promise<string> {
  const res = await page.request.get(`${API_BASE}/api/v1/subscription/plans`);
  if (res.status() !== 200) return "unknown";
  const body = await res.json();
  return body?.data?.mode ?? "unknown";
}

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

test.describe("guest access", () => {
  test("Premium requires an account; the page redirects to sign-in", async ({ page }) => {
    // Plans are public in every mode, but the caller's own subscription needs auth.
    const plans = await page.request.get(`${API_BASE}/api/v1/subscription/plans`);
    expect(plans.status()).toBe(200);

    const mine = await page.request.get(`${API_BASE}/api/v1/subscription`);
    expect(mine.status()).toBe(401);

    // The frontend can never activate Premium - neither paid checkout nor the
    // free demo can be reached without auth.
    const checkout = await page.request.post(`${API_BASE}/api/v1/subscription/checkout`, {
      data: { plan_code: "premium_monthly" },
      headers: { Origin: APP_ORIGIN },
    });
    expect([401, 403]).toContain(checkout.status());

    const demo = await page.request.post(`${API_BASE}/api/v1/subscription/demo`, {
      headers: { Origin: APP_ORIGIN },
    });
    expect([401, 403]).toContain(demo.status());

    await page.goto("/account/subscription");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("premium journey (live mode)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "the signed-in journey runs once - see the header note",
    );
    test.skip((await subscriptionMode(page)) !== "live", "backend is not in live mode");
  });

  test("writer donation link, pricing, checkout, and slip submission", async ({ page }) => {
    test.setTimeout(180_000); // covers one worst-case auth-window retry
    await registerFreshAccount(page, "e2esub");

    // --- Writer sets an external donation link (distinct from Premium) -----
    await page.goto("/studio/author");
    await page.getByTestId("donation-url-input").fill("https://easydonate.example/e2e-writer");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("บันทึกลิงก์แล้ว")).toBeVisible();

    // --- Public pricing shows exactly the three confirmed plans ------------
    await page.goto("/pricing");
    await expect(page.getByTestId("plan-premium_monthly")).toBeVisible();
    await expect(page.getByTestId("plan-premium_yearly")).toBeVisible();
    await expect(page.getByTestId("plan-pro_monthly")).toBeVisible();
    await expect(page.getByTestId("plan-premium_monthly")).toContainText("99");

    // --- Checkout → PromptPay → submit slip → awaiting verification --------
    await page.goto("/account/subscription");
    await page.waitForLoadState("networkidle");

    const checkoutDone = page.waitForResponse(
      (r) => r.url().endsWith("/subscription/checkout") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "สมัคร premium_monthly" }).click();
    expect((await checkoutDone).status()).toBe(201);
    await expect(page.getByTestId("checkout-panel")).toBeVisible();
    await expect(page.getByTestId("checkout-amount")).toContainText("99");

    await page
      .getByTestId("slip-input")
      .setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });

    const slipDone = page.waitForResponse(
      (r) => r.url().endsWith("/media") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "ส่งสลิป" }).click();
    expect((await slipDone).status()).toBe(201);

    // The reader is told it is under review - Premium is NOT active yet.
    await expect(page.getByTestId("awaiting-verification")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("subscription-tier")).toHaveText("ฟรี");
  });
});

test.describe("demo journey (demo mode)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "the signed-in journey runs once - see the header note",
    );
    test.skip((await subscriptionMode(page)) !== "demo", "backend is not in demo mode");
  });

  test("free trial: activate the demo, get the tier, no payment is created", async ({ page }) => {
    test.setTimeout(180_000);
    await registerFreshAccount(page, "e2edemo");

    // Pricing advertises a free trial, not a payment.
    await page.goto("/pricing");
    await expect(page.getByTestId("pricing-demo-banner")).toBeVisible();
    await expect(page.getByTestId("plan-pro_monthly")).toContainText("ทดลองใช้");

    // Activate the demo on the account page.
    await page.goto("/account/subscription");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("demo-activate")).toBeVisible();

    const demoDone = page.waitForResponse(
      (r) => r.url().endsWith("/subscription/demo") && r.request().method() === "POST",
    );
    await page.getByTestId("demo-activate-button").getByRole("button").click();
    expect((await demoDone).status()).toBe(201);

    // The trial is active: the tier is granted, an expiry shows, and there is NO
    // payment UI anywhere (no fake payment - brief §2, §20).
    await expect(page.getByTestId("demo-active")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("subscription-tier")).not.toHaveText("ฟรี");
    await expect(page.getByTestId("demo-expires")).toBeVisible();
    await expect(page.getByTestId("checkout-panel")).toHaveCount(0);
    await expect(page.getByTestId("slip-input")).toHaveCount(0);

    // The backend confirms the demo created NO payment record.
    const overview = await page.request.get(`${API_BASE}/api/v1/subscription`);
    const body = await overview.json();
    expect(body.data.subscription.source).toBe("demo");
    expect(body.data.latest_payment ?? null).toBeNull();
  });
});
