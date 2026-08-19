import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, REQUEST_ID_HEADER, getMany, getOne } from "@/lib/api";

/**
 * The API client is the single place the envelope and error contract are
 * interpreted (docs/09 §7), so these tests pin that behaviour.
 */

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/**
 * Awaits a call that is expected to reject and returns the ApiError.
 *
 * Failing the test when it resolves matters: without this, a client that
 * silently swallowed an error would make these assertions vacuous.
 */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected the request to reject, but it resolved");
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("getOne", () => {
  it("unwraps the data envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { title: "ตัวอย่าง" } }));

    await expect(getOne<{ title: string }>("/novels/example")).resolves.toEqual({
      title: "ตัวอย่าง",
    });
  });

  it("targets the versioned API base", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));

    await getOne("/fiction-formats");

    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/fiction-formats");
  });

  // Cookie-based sessions only work if credentials are sent (docs/10 §11).
  it("sends credentials so the session cookie is included", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));

    await getOne("/fiction-formats");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });
});

describe("getMany", () => {
  it("returns items alongside pagination meta", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ id: "1" }, { id: "2" }],
        meta: { page: 1, per_page: 20, total: 125 },
      }),
    );

    const { items, meta } = await getMany<{ id: string }>("/novels");

    expect(items).toHaveLength(2);
    expect(meta.total).toBe(125);
  });

  it("drops empty query parameters instead of sending blanks", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }),
    );

    await getMany("/novels", {
      query: { genre: "fantasy", tag: undefined, q: "", page: 2 },
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("genre=fantasy");
    expect(url).toContain("page=2");
    expect(url).not.toContain("tag=");
    expect(url).not.toContain("q=");
  });

  it("forwards fiction format filters", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }),
    );

    await getMany("/novels", {
      query: { story_structure: "one_shot", presentation_format: "chat" },
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("story_structure=one_shot");
    expect(url).toContain("presentation_format=chat");
  });
});

describe("error handling", () => {
  it("throws an ApiError carrying the stable code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "NOVEL_NOT_FOUND", message: "Novel not found." } },
        { status: 404 },
      ),
    );

    const error = await expectApiError(getOne("/novels/missing"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NOVEL_NOT_FOUND");
    expect(error.isNotFound).toBe(true);
  });

  it("surfaces field-level validation detail", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "INVALID_FICTION_FORMAT",
            message: "The requested fiction format is not supported.",
            fields: { presentation_format: ["Must be one of: standard, chat."] },
          },
        },
        { status: 422 },
      ),
    );

    const error = await expectApiError(getOne("/novels/x"));

    expect(error.code).toBe("INVALID_FICTION_FORMAT");
    expect(error.fields?.presentation_format).toHaveLength(1);
  });

  it("captures the request ID so a report can be traced to a server log", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "x" } }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          [REQUEST_ID_HEADER]: "req_abc123",
        },
      }),
    );

    const error = await expectApiError(getOne("/novels/x"));

    expect(error.requestId).toBe("req_abc123");
  });

  // A proxy error page is not in our envelope, but it must still arrive as a
  // usable ApiError rather than a parse crash.
  it("handles a non-envelope error body", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );

    const error = await expectApiError(getOne("/novels/x"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("INTERNAL_ERROR");
  });

  it("reports an unreachable API as a service error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const error = await expectApiError(getOne("/fiction-formats"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("distinguishes 401 from 403", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "x" } }, { status: 401 }),
    );
    const unauthorized = await expectApiError(getOne("/me/profile"));
    expect(unauthorized.isUnauthorized).toBe(true);
    expect(unauthorized.isForbidden).toBe(false);

    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "FORBIDDEN", message: "x" } }, { status: 403 }),
    );
    const forbidden = await expectApiError(getOne("/novels/other"));
    expect(forbidden.isForbidden).toBe(true);
    expect(forbidden.isUnauthorized).toBe(false);
  });
});
