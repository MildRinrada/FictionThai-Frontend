import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  activeFilterCount,
  apiQueryFromFilters,
  filtersFromParams,
  paramsFromFilters,
  searchTabOf,
} from "@/lib/search-client";

/**
 * The search state model (search review 2026-08 section C): the URL is the
 * whole state, so serialising and parsing must be exact inverses - a shared
 * link that loses a filter is a different search wearing the same address.
 */

describe("search filters ↔ URL", () => {
  it("round-trips every dimension through the URL", () => {
    const filters = {
      ...EMPTY_FILTERS,
      q: "จงหลี่",
      genres: ["fantasy", "bl"],
      tags: ["fluff"],
      excludeTags: ["angst"],
      status: "completed",
      format: "chat",
      structure: "one_shot",
      origin: "fanfiction",
      rating: "teen",
      fandom: "Genshin Impact",
      character: "จงหลี่",
      excludeWarnings: ["ตัวละครหลักตาย"],
      minChapters: 6,
      maxChapters: 20,
      updatedWithin: 7,
      variables: true,
      adult: false,
      sort: "popular",
      page: 3,
    };

    const params = paramsFromFilters(filters);
    expect(filtersFromParams(params)).toEqual(filters);
  });

  it("omits defaults so an empty search is a bare address", () => {
    expect(paramsFromFilters(EMPTY_FILTERS).toString()).toBe("");
  });

  it("keeps the result-tab in the URL only when it is not the default", () => {
    expect(paramsFromFilters(EMPTY_FILTERS, "novels").has("type")).toBe(false);
    expect(paramsFromFilters(EMPTY_FILTERS, "authors").get("type")).toBe("authors");
    expect(searchTabOf("authors")).toBe("authors");
    expect(searchTabOf("nonsense")).toBe("novels");
  });

  it("drops malformed numbers instead of sending them", () => {
    const params = new URLSearchParams("min_chapters=-5&updated_within=abc&page=0");
    const filters = filtersFromParams(params);
    expect(filters.minChapters).toBe(0);
    expect(filters.updatedWithin).toBe(0);
    expect(filters.page).toBe(1);
  });
});

describe("API query", () => {
  it("joins term lists and drops inactive dimensions", () => {
    const query = apiQueryFromFilters({
      ...EMPTY_FILTERS,
      q: "แมว",
      genres: ["bl", "fantasy"],
      excludeTags: ["angst", "gore"],
      variables: true,
    });
    expect(query.genre).toBe("bl,fantasy");
    expect(query.exclude_tag).toBe("angst,gore");
    expect(query.variables).toBe("1");
    expect(query.status).toBeUndefined();
    expect(query.min_chapters).toBeUndefined();
    expect(query.page).toBeUndefined();
  });
});

describe("activeFilterCount", () => {
  it("counts dimensions, not keystrokes - the ตัวกรอง (N) number", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        genres: ["bl", "fantasy"],
        status: "completed",
        minChapters: 1,
        maxChapters: 5,
        variables: true,
      }),
    ).toBe(5);
  });

  it("does not count the query or the adult preference as filters", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: "แมว", adult: true })).toBe(0);
  });
});
