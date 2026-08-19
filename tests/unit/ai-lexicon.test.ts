import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The word bank always arrives as two arrays.
 *
 * A fiction with no cast, no reader variables and no tags has nothing to derive
 * an auto bank from, and the API used to answer `"auto": null` for it. The
 * settings page reads `.length` off both lists, so every fiction on its first
 * day took the whole ตั้งค่าเรื่อง page down to its error boundary - the writer
 * saw "เกิดข้อผิดพลาด" and no settings at all. The API is fixed; this keeps a
 * cached or older response from doing it again (docs/12).
 */

const getOne = vi.fn();
const post = vi.fn();

vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  post: (...args: unknown[]) => post(...args),
  put: vi.fn(),
  del: vi.fn(),
  patch: vi.fn(),
  ApiError: class extends Error {},
}));

vi.mock("@/lib/auth-client", () => ({
  mutationHeaders: () => ({}),
  readCSRFToken: () => "csrf",
}));

let client: typeof import("@/lib/ai-client");

beforeEach(async () => {
  client = await import("@/lib/ai-client");
});

afterEach(() => {
  getOne.mockReset();
  post.mockReset();
});

describe("the fiction word bank", () => {
  it("turns a null auto list into an empty one", async () => {
    getOne.mockResolvedValue({ custom: [], auto: null });

    const bank = await client.getLexicon("my-novel");

    expect(bank.auto).toEqual([]);
    expect(bank.custom).toEqual([]);
    expect(() => bank.auto.length).not.toThrow();
  });

  it("guards the same way after adding a term", async () => {
    post.mockResolvedValue({ custom: null, auto: ["จงหลี่"] });

    const bank = await client.addLexiconTerm("my-novel", "จงหลี่");

    expect(bank.custom).toEqual([]);
    expect(bank.auto).toEqual(["จงหลี่"]);
  });

  it("passes a well-formed answer through untouched", async () => {
    const terms = [{ id: "t1", term: "เอเธอร์" }];
    getOne.mockResolvedValue({ custom: terms, auto: ["จงหลี่"] });

    const bank = await client.getLexicon("my-novel");

    expect(bank.custom).toEqual(terms);
    expect(bank.auto).toEqual(["จงหลี่"]);
  });
});
