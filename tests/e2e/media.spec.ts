import { expect, test, type Page } from "@playwright/test";

/**
 * Media journeys (docs/15 §33, Phase 9): avatar upload, cover upload with
 * real ownership, validation refusals, and the public file route - against
 * the real API, PostgreSQL, Redis, and the real storage backend.
 *
 * The signed-in journey runs on ONE browser project only and uses ONE
 * account: every registration spends the deliberately strict Auth-tier
 * budget the whole parallel E2E suite shares (docs/10 §38).
 */

/** A complete, valid 1×1 transparent PNG. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGIAAQAA" +
    "AP//BQABDQottAAAAABJRU5ErkJggg==",
  "base64",
);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

/**
 * Registers a fresh account through the real registration flow. If the
 * shared Auth-tier window is exhausted (429), it waits for the next window
 * and retries once - a legitimate client's behaviour, never a weakening of
 * the limit.
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

test.describe("guest access", () => {
  test("uploading requires an account; unknown files answer 404", async ({ page }) => {
    const upload = await page.request.post(`${API_BASE}/api/v1/media`, {
      multipart: {
        purpose: "avatar",
        file: { name: "a.png", mimeType: "image/png", buffer: PNG_BYTES },
      },
    });
    expect(upload.status()).toBe(401);

    const missing = await page.request.get(
      `${API_BASE}/media/avatar/no-such-object.png`,
    );
    expect(missing.status()).toBe(404);
  });
});

test.describe("media journey", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "the signed-in media journey runs once - see the header note",
    );
  });

  test("avatar and cover uploads through the real UI, with validation", async ({
    page,
  }) => {
    test.setTimeout(180_000); // covers one worst-case auth-window retry
    await registerFreshAccount(page, "e2emedia");

    // --- Avatar: reject non-image bytes first, then succeed --------------
    // The file is DECLARED image/png (so it clears the input's accept
    // filter) but its bytes are not an image - proving the server sniffs
    // content and the declared type is never trusted (docs/11 §28).
    await page.goto("/");
    // The upload control is a hidden file input whose onChange attaches only
    // at hydration; setInputFiles fires a native change the React handler
    // would miss if it ran first. Wait for the client to settle.
    await page.waitForLoadState("networkidle");
    await page
      .getByLabel("เพิ่มรูปโปรไฟล์")
      .setInputFiles({ name: "not-image.png", mimeType: "image/png", buffer: Buffer.from("just text, not an image") });
    // getByText, not getByRole("alert"): Next's empty route announcer also
    // carries role=alert and would match first.
    await expect(
      page.getByText("รองรับเฉพาะไฟล์ภาพ JPEG, PNG หรือ WebP"),
    ).toBeVisible();

    await page
      .getByLabel("เพิ่มรูปโปรไฟล์")
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_BYTES });
    const avatar = page.getByAltText("รูปโปรไฟล์ของคุณ");
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute("src", /\/media\/avatar\//);

    // The served file itself is real bytes with the sniffed type.
    const avatarSrc = await avatar.getAttribute("src");
    const served = await page.request.get(avatarSrc!);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("image/png");

    // --- Cover: create a fiction, then upload its cover ------------------
    await page.goto("/studio/novels/new");
    await page.getByLabel(/ชื่อเรื่อง/).fill(`นิยายมีปก ${Date.now() % 1_000_000}`);
    await page.getByRole("button", { name: "สร้างนิยาย" }).click();
    // Wait for the redirect to the CREATED novel - "/studio/novels/new" is
    // still on this prefix, so match the UUID specifically.
    await expect(page).toHaveURL(/\/studio\/novels\/[0-9a-f]{8}-[0-9a-f-]+$/);
    const novelId = page.url().split("/").pop()!;

    // The fiction page: a private draft resolves through the owner's own
    // credentials, so the cover control is present immediately.
    await page.goto(`/novel/${novelId}`);
    await page.waitForLoadState("networkidle"); // same hydration race as above
    const uploadDone = page.waitForResponse(
      (res) => res.url().endsWith("/api/v1/media") && res.request().method() === "POST",
    );
    await page
      .getByLabel("อัปโหลดปกนิยาย")
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG_BYTES });
    expect((await uploadDone).status()).toBe(201);
    await expect(page.getByAltText("ปกใหม่ของนิยาย")).toBeVisible();

    // The authoritative state: the API's novel now carries the cover URL.
    const novel = await page.request.get(`${API_BASE}/api/v1/novels/${novelId}`);
    expect(novel.status()).toBe(200);
    const body = (await novel.json()) as { data: { cover_url?: string } };
    expect(body.data.cover_url).toMatch(/\/media\/novel_cover\//);
  });
});
