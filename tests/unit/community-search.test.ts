import { describe, expect, it } from "vitest";

import {
  parseSearchInput,
  searchApiQuery,
  searchHref,
  searchStateOf,
  type SearchState,
} from "@/lib/community-search";

/**
 * The search grammar (docs/COMMUNITY-FEED.md): the URL carries what the user
 * TYPED; these functions turn it into the API's structured parameters. The
 * rule they defend: plain text must always work - operators only ever narrow.
 */

describe("parseSearchInput", () => {
  it("keeps plain Thai text as text", () => {
    expect(parseSearchInput("ฟิคใหม่ น่าอ่าน")).toEqual({
      text: "ฟิคใหม่ น่าอ่าน",
    });
  });

  it("lifts from:@handle out of the text", () => {
    const parsed = parseSearchInput("from:@mild ตอนใหม่");
    expect(parsed.author).toBe("mild");
    expect(parsed.text).toBe("ตอนใหม่");
  });

  it("accepts the operators without an @ as well", () => {
    expect(parseSearchInput("from:mild").author).toBe("mild");
    expect(parseSearchInput("to:mild").mention).toBe("mild");
  });

  it("parses to:, has:, and quoted fandom together", () => {
    const parsed = parseSearchInput('to:@napat has:chapter fandom:"Genshin Impact" อวยยศ');
    expect(parsed).toEqual({
      text: "อวยยศ",
      mention: "napat",
      has: "chapter",
      fandom: "Genshin Impact",
    });
  });

  it("treats a lone #tag as a tag search", () => {
    const parsed = parseSearchInput("#สปอยล์เบา");
    expect(parsed.tag).toBe("สปอยล์เบา");
    expect(parsed.text).toBe("");
  });

  it("leaves a #tag inside a sentence as text", () => {
    const parsed = parseSearchInput("ใครใช้ #ooc บ้าง");
    expect(parsed.tag).toBeUndefined();
    expect(parsed.text).toBe("ใครใช้ #ooc บ้าง");
  });

  it("ignores unknown has: values as plain text", () => {
    const parsed = parseSearchInput("has:image รูปสวย");
    expect(parsed.has).toBeUndefined();
    expect(parsed.text).toContain("has:image");
  });
});

describe("search state and URLs", () => {
  const state: SearchState = {
    q: "from:@mild ตอนใหม่",
    from: "all",
    range: "7d",
    has: "chapter",
    sort: "top",
  };

  it("round-trips through the /community URL", () => {
    const href = searchHref(state);
    const url = new URL(`https://x${href}`);
    const back = searchStateOf(Object.fromEntries(url.searchParams));
    expect(back).toEqual(state);
  });

  it("omits defaults so the plain feed URL stays /community", () => {
    expect(
      searchHref({ q: "", from: "all", range: "all", sort: "new" }),
    ).toBe("/community");
  });

  it("lets a typed operator win over the matching chip", () => {
    const query = searchApiQuery(
      { q: "has:none ฟิค", from: "all", range: "all", has: "chapter", sort: "new" },
      parseSearchInput("has:none ฟิค"),
    );
    expect(query.has).toBe("none");
    expect(query.q).toBe("ฟิค");
  });

  it("sends a lone #tag as tag, not q", () => {
    const query = searchApiQuery(
      { q: "#ooc", from: "me", range: "24h", sort: "top" },
      parseSearchInput("#ooc"),
    );
    expect(query).toMatchObject({
      tag: "ooc",
      q: undefined,
      from: "me",
      range: "24h",
      sort: "top",
    });
  });
});
