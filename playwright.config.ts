import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration (docs/15 §33).
 *
 * Browsers are not installed by `npm install`. Run once:
 *
 *   npx playwright install --with-deps
 *
 * The E2E suite requires BOTH the Go API and the Next.js app to be running;
 * `webServer` starts the frontend, but the API must be started separately
 * because it needs PostgreSQL.
 *
 * CAUTION: `reuseExistingServer` is on outside CI, and it does not check WHICH
 * application answers on the port. If another project already holds 3000, this
 * suite will test that one and report failures that look like regressions here.
 * Set PLAYWRIGHT_APP_URL to a free port when that happens.
 */

const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A test that only passes on a retry is flaky; never let that happen in CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Mobile first: Thai readers reach the platform primarily on mobile
    // (README "Mobile First", docs/15 §36), so it is not an afterthought here.
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "npm run dev",
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
