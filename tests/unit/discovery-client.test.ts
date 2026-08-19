import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * Browser-side discovery calls.
 *
 * The contract under test: vocabulary reads carry no CSRF token (they must
 * work for guests), tag creation does carry it (docs/11 §22), and the search
 * client passes the documented parameters through without inventing its own
 * filter vocabulary (docs/09 §11, §22).
 */

const fetchMock = vi.fn();

function clearCookies() {
  for (const entry of document.cookie.split(";")) {
    const name = entry.split("=")[0]?.trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  clearCookies();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  clearCookies();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentRequest() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url: new URL(url),
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
}

describe("vocabularies", () => {
  it("reads genres without a CSRF token", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    const { getGenres } = await import("@/lib/discovery-client");
    await getGenres();

    const { method, url, headers } = sentRequest();
    expect(method).toBe("GET");
    expect(url.pathname).toMatch(/\/genres$/);
    // Guest browsing must work; a token requirement would break it.
    expect(headers?.["X-CSRF-Token"]).toBeUndefined();
  });

  it("passes the tag typeahead query through", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }));

    const { getTags } = await import("@/lib/discovery-client");
    await getTags({ q: "slow" });

    expect(sentRequest().url.searchParams.get("q")).toBe("slow");
  });

  it("creates a tag with the CSRF header", async () => {
    document.cookie = "ft_csrf=tag-token";
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { id: "t1", name: "slow-burn", slug: "slow-burn" } }),
    );

    const { createTag } = await import("@/lib/discovery-client");
    const tag = await createTag("Slow-Burn");

    const { method, url, headers, body } = sentRequest();
    expect(method).toBe("POST");
    expect(url.pathname).toMatch(/\/tags$/);
    expect(headers["X-CSRF-Token"]).toBe("tag-token");
    // The RAW name is sent; normalization is the server's job, so web and
    // mobile cannot normalize differently (docs/09 §51's principle).
    expect(body).toEqual({ name: "Slow-Burn" });
    expect(tag.name).toBe("slow-burn");
  });

  it("surfaces the format-metadata ban verbatim", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Validation failed.",
            fields: {
              name: ["Fiction formats are first-class metadata, not tags. Set the format on the fiction instead."],
            },
          },
        },
        422,
      ),
    );

    const { createTag } = await import("@/lib/discovery-client");
    const error = await createTag("chat-fiction").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.fields?.name?.[0]).toContain("first-class metadata");
  });
});

describe("searchNovels", () => {
  it("targets the search endpoint with the documented parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }));

    const { searchNovels } = await import("@/lib/discovery-client");
    await searchNovels({ q: "มหากาพย์", genre: "sci-fi", sort: "popular", page: 2 });

    const { url } = sentRequest();
    expect(url.pathname).toMatch(/\/search\/novels$/);
    expect(url.searchParams.get("q")).toBe("มหากาพย์");
    // Term filters travel by SLUG, singular (docs/09 §11).
    expect(url.searchParams.get("genre")).toBe("sci-fi");
    expect(url.searchParams.get("sort")).toBe("popular");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("unwraps results that carry discovery metadata", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "n1",
            title: "มหากาพย์ดวงดาว",
            genres: [{ id: "g1", name: "Sci-Fi", slug: "sci-fi" }],
            tags: [],
          },
        ],
        meta: { page: 1, per_page: 20, total: 1 },
      }),
    );

    const { searchNovels } = await import("@/lib/discovery-client");
    const { items, meta } = await searchNovels({ q: "ดวงดาว" });

    expect(meta.total).toBe(1);
    // docs/09 §22: results expose format AND discovery metadata so a reader
    // understands the result before opening it.
    expect(items[0].genres[0].slug).toBe("sci-fi");
  });
});
