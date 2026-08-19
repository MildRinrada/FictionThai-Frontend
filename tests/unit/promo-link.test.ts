import { describe, expect, it, vi } from "vitest";

/**
 * The promo form's link normaliser: an admin pastes the full URL out of the
 * browser bar, and the form - not the admin - turns it into the internal path
 * the API demands. A foreign origin passes through untouched so the Thai
 * error can name the rule.
 */

vi.mock("@/lib/ai-client", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const { normalizeLink } = await import("@/features/promo/promo-manager");

// jsdom's origin is http://localhost:3000
describe("normalizeLink", () => {
  it("keeps a clean internal path as-is", () => {
    expect(normalizeLink("/novel/my-story")).toBe("/novel/my-story");
  });

  it("strips this site's origin from a pasted full URL", () => {
    expect(normalizeLink("http://localhost:3000/novel/my-story?ch=2#top")).toBe(
      "/novel/my-story?ch=2#top",
    );
  });

  it("strips a schemeless host paste", () => {
    expect(normalizeLink("localhost:3000/novel/my-story")).toBe("/novel/my-story");
  });

  it("prepends the missing slash on a bare path", () => {
    expect(normalizeLink("novel/my-story")).toBe("/novel/my-story");
  });

  it("leaves a foreign origin untouched for the error to name", () => {
    expect(normalizeLink("https://elsewhere.example/novel/x")).toBe(
      "https://elsewhere.example/novel/x",
    );
  });
});
