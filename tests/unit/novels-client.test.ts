import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * Browser-side fiction and chapter calls.
 *
 * The assertions that matter here are about the CONTRACT with the API: that
 * mutations carry the CSRF header (docs/11 §22), that a PATCH sends only the
 * fields it means to change (docs/09 §14.7), and that responses are parsed into
 * the documented shape.
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

/** The request the client actually sent. */
function sentRequest() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url: new URL(url),
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
}

describe("listNovels", () => {
  it("passes the documented filters through as query parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }));

    const { listNovels } = await import("@/lib/novels-client");
    await listNovels({
      q: "magic",
      story_structure: "one_shot",
      presentation_format: "chat",
      content_mode: "headcanon",
      sort: "latest",
      page: 2,
    });

    const { url, method } = sentRequest();
    expect(method).toBe("GET");
    // Each dimension is its own parameter - never one combined value
    // (docs/09 §11).
    expect(url.searchParams.get("story_structure")).toBe("one_shot");
    expect(url.searchParams.get("presentation_format")).toBe("chat");
    expect(url.searchParams.get("content_mode")).toBe("headcanon");
    expect(url.searchParams.get("q")).toBe("magic");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("unwraps the collection envelope and its meta", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ id: "n1", title: "หนึ่ง" }],
        meta: { page: 1, per_page: 20, total: 1 },
      }),
    );

    const { listNovels } = await import("@/lib/novels-client");
    const { items, meta } = await listNovels();

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("หนึ่ง");
    expect(meta.total).toBe(1);
  });

  it("does not send a CSRF header on a read", async () => {
    document.cookie = "ft_csrf=token-value";
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }));

    const { listNovels } = await import("@/lib/novels-client");
    await listNovels();

    // Reads change nothing, and requiring a token would break guest reading.
    expect(sentRequest().headers?.["X-CSRF-Token"]).toBeUndefined();
  });
});

describe("createNovel", () => {
  it("sends the CSRF header for a cookie-authenticated mutation", async () => {
    document.cookie = "ft_csrf=the-csrf-token";
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "n1" } }, 201));

    const { createNovel } = await import("@/lib/novels-client");
    await createNovel({ age_rating: "general", title: "นิยายใหม่" });

    expect(sentRequest().headers["X-CSRF-Token"]).toBe("the-csrf-token");
  });

  it("omits format dimensions the caller did not choose", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "n1" } }, 201));

    const { createNovel } = await import("@/lib/novels-client");
    await createNovel({ age_rating: "general", title: "นิยายใหม่", presentation_format: "chat" });

    const { body } = sentRequest();
    expect(body.presentation_format).toBe("chat");
    // An omitted dimension takes the SERVER's documented default; sending a
    // guess here would let the two disagree (docs/09 §15).
    expect(body).not.toHaveProperty("story_structure");
    expect(body).not.toHaveProperty("content_mode");
  });

  it("surfaces the API's per-field validation errors", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "INVALID_FICTION_FORMAT",
            message: "The requested fiction format is not supported.",
            fields: { presentation_format: ["Must be one of: standard, chat."] },
          },
        },
        422,
      ),
    );

    const { createNovel } = await import("@/lib/novels-client");
    await expect(
      createNovel({ age_rating: "general", title: "x", presentation_format: "script" as never }),
    ).rejects.toMatchObject({ code: "INVALID_FICTION_FORMAT" });
  });
});

describe("updateNovelFormat", () => {
  // docs/09 §14.7: an omitted dimension keeps its current value.
  it("sends only the dimensions being changed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          id: "n1",
          story_structure: "one_shot",
          presentation_format: "chat",
          content_mode: "general",
          needs_chat_setup: true,
        },
      }),
    );

    const { updateNovelFormat } = await import("@/lib/novels-client");
    const result = await updateNovelFormat("n1", { presentation_format: "chat" });

    const { method, body, url } = sentRequest();
    expect(method).toBe("PATCH");
    expect(url.pathname).toMatch(/\/novels\/n1\/format$/);
    expect(body).toEqual({ presentation_format: "chat" });
    // Sending the untouched dimensions back would risk overwriting a change
    // made in another tab with a stale value.
    expect(body).not.toHaveProperty("story_structure");

    // docs/08 §11: the warning is surfaced, not acted upon.
    expect(result.needs_chat_setup).toBe(true);
  });
});

describe("updateChapter", () => {
  // The single most damaging bug this domain could have: a PATCH that means to
  // change the status erasing a manuscript.
  it("omits content entirely when only the status changes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "c1" } }));

    const { updateChapter } = await import("@/lib/novels-client");
    await updateChapter("n1", "c1", { status: "published" });

    const { body } = sentRequest();
    expect(body).toEqual({ status: "published" });
    expect(body).not.toHaveProperty("content");
    expect(body).not.toHaveProperty("messages");
  });

  it("sends an explicit null to clear content", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "c1" } }));

    const { updateChapter } = await import("@/lib/novels-client");
    await updateChapter("n1", "c1", { content: null });

    expect(sentRequest().body).toEqual({ content: null });
  });

  it("sends chat messages without positions", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "c1" } }));

    const { updateChapter } = await import("@/lib/novels-client");
    await updateChapter("n1", "c1", {
      messages: [
        { speaker_name: "Alice", message_type: "message", content: "อยู่ไหน?" },
        { speaker_name: "Bob", message_type: "message", content: "กำลังกลับ" },
      ],
    });

    const { body } = sentRequest();
    // The server assigns positions from array order, so a client cannot create
    // a gap or a duplicate (docs/CONTENT-MODEL.md §4).
    for (const message of body.messages) {
      expect(message).not.toHaveProperty("position");
    }
  });
});

describe("reference encoding", () => {
  it("escapes a slug so it cannot alter the request path", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "n1" } }));

    const { getNovel } = await import("@/lib/novels-client");
    await getNovel("../../auth/me");

    const { url } = sentRequest();
    expect(url.pathname).not.toContain("/auth/me");
    expect(url.pathname).toContain("%2F");
  });

  it("keeps a Thai slug usable", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "n1" } }));

    const { getNovel } = await import("@/lib/novels-client");
    await getNovel("นิยายของฉัน");

    // Percent-encoded on the wire, and decodes back to the original.
    expect(decodeURIComponent(sentRequest().url.pathname)).toContain("นิยายของฉัน");
  });
});

describe("error handling", () => {
  it("reports a forbidden mutation as an ApiError the UI can branch on", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "EMAIL_VERIFICATION_REQUIRED", message: "Please verify." } },
        403,
      ),
    );

    const { publishChapter } = await import("@/lib/novels-client");
    const error = await publishChapter("n1", "c1").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isForbidden).toBe(true);
    expect(error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });
});
