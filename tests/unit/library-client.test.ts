import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * Browser-side shelf calls.
 *
 * The contract under test: mutations carry the CSRF header (docs/11 §22),
 * reads do not, the progress save is a PUT with the documented body
 * (docs/09 §17), and references are escaped so a slug cannot alter the path.
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

function noContent() {
  return new Response(null, { status: 204 });
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

describe("bookmarks", () => {
  it("sends the CSRF header when bookmarking", async () => {
    document.cookie = "ft_csrf=shelf-token";
    fetchMock.mockResolvedValue(noContent());

    const { bookmarkNovel } = await import("@/lib/library-client");
    await bookmarkNovel("นิยายของฉัน");

    const { method, headers, url } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("shelf-token");
    expect(decodeURIComponent(url.pathname)).toContain("นิยายของฉัน");
    expect(url.pathname.endsWith("/bookmark")).toBe(true);
  });

  it("sends the CSRF header when removing a bookmark", async () => {
    document.cookie = "ft_csrf=shelf-token";
    fetchMock.mockResolvedValue(noContent());

    const { removeBookmark } = await import("@/lib/library-client");
    await removeBookmark("n1");

    const { method, headers } = sentRequest();
    expect(method).toBe("DELETE");
    expect(headers["X-CSRF-Token"]).toBe("shelf-token");
  });

  it("does not send a CSRF header on a library read", async () => {
    document.cookie = "ft_csrf=shelf-token";
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }));

    const { getLibrary } = await import("@/lib/library-client");
    await getLibrary();

    expect(sentRequest().headers?.["X-CSRF-Token"]).toBeUndefined();
  });

  it("passes the status section filter through as a query parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }));

    const { getLibrary } = await import("@/lib/library-client");
    await getLibrary({ status: "completed", page: 2 });

    const { url } = sentRequest();
    // docs/03 §13: the "Completed" shelf is a server-side filter, not a
    // client-side one - the server owns visibility.
    expect(url.searchParams.get("status")).toBe("completed");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("escapes a ref so it cannot alter the request path", async () => {
    fetchMock.mockResolvedValue(noContent());

    const { bookmarkNovel } = await import("@/lib/library-client");
    await bookmarkNovel("../../auth/me");

    const { url } = sentRequest();
    expect(url.pathname).not.toContain("/auth/me");
    expect(url.pathname).toContain("%2F");
  });
});

describe("follows", () => {
  it("targets the documented follow endpoints", async () => {
    document.cookie = "ft_csrf=shelf-token";
    fetchMock.mockResolvedValue(noContent());

    const { followUser } = await import("@/lib/library-client");
    await followUser("user-42");

    const { method, url, headers } = sentRequest();
    expect(method).toBe("POST");
    expect(url.pathname).toMatch(/\/users\/user-42\/follow$/);
    expect(headers["X-CSRF-Token"]).toBe("shelf-token");
  });

  it("surfaces a self-follow rejection as an ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Validation failed.",
            fields: { user_id: ["You cannot follow yourself."] },
          },
        },
        422,
      ),
    );

    const { followUser } = await import("@/lib/library-client");
    const error = await followUser("me").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.fields?.user_id?.[0]).toBe("You cannot follow yourself.");
  });
});

describe("reading progress", () => {
  it("saves the position as a PUT with the documented body", async () => {
    document.cookie = "ft_csrf=shelf-token";
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          novel_id: "n1",
          chapter_id: "c1",
          progress_percent: 42.5,
          last_read_at: "2026-08-10T00:00:00Z",
        },
      }),
    );

    const { saveProgress } = await import("@/lib/library-client");
    const saved = await saveProgress("n1", { chapter_id: "c1", progress_percent: 42.5 });

    const { method, url, body, headers } = sentRequest();
    // docs/09 §17 reconciled with docs/08 §18: the wire field is
    // progress_percent, matching what the database stores.
    expect(method).toBe("PUT");
    expect(url.pathname).toMatch(/\/novels\/n1\/progress$/);
    expect(body).toEqual({ chapter_id: "c1", progress_percent: 42.5 });
    expect(headers["X-CSRF-Token"]).toBe("shelf-token");
    expect(saved.progress_percent).toBe(42.5);
  });

  it("reports an unstarted fiction as a 404 the UI can branch on", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "READING_PROGRESS_NOT_FOUND", message: "No reading progress." } },
        404,
      ),
    );

    const { getNovelProgress } = await import("@/lib/library-client");
    const error = await getNovelProgress("n1").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNotFound).toBe(true);
    expect(error.code).toBe("READING_PROGRESS_NOT_FOUND");
  });

  it("unwraps the continue-reading collection", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            novel: { id: "n1", title: "หนึ่ง" },
            chapter: { id: "c1", chapter_number: 3, slug: "ตอนที่-สาม" },
            progress_percent: 80,
            last_read_at: "2026-08-10T00:00:00Z",
          },
          {
            novel: { id: "n2", title: "สอง" },
            // The chapter the reader stopped at is no longer live: the entry
            // survives with a null chapter (docs/08 §3).
            chapter: null,
            progress_percent: 10,
            last_read_at: "2026-08-09T00:00:00Z",
          },
        ],
        meta: { page: 1, per_page: 20, total: 2 },
      }),
    );

    const { getContinueReading } = await import("@/lib/library-client");
    const { items, meta } = await getContinueReading();

    expect(meta.total).toBe(2);
    expect(items[0].chapter?.chapter_number).toBe(3);
    expect(items[1].chapter).toBeNull();
  });
});
