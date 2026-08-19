import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Browser-side comment calls.
 *
 * The contract under test: mutations carry the CSRF header (docs/11 §22),
 * reads do not, and every reference is escaped so a Thai slug or a hostile id
 * cannot alter the path.
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

const commentPayload = {
  data: {
    id: "c1",
    novel_id: "n1",
    content: "สนุกมาก",
    edited: false,
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    author: { id: "u1", username: "reader" },
    reply_count: 0,
    is_owner: true,
  },
};

describe("comment reads", () => {
  it("lists a fiction thread without a CSRF header", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }),
    );

    const { getNovelComments } = await import("@/lib/comments-client");
    await getNovelComments("นิยายไทย");

    const { method, headers, url } = sentRequest();
    expect(method).toBe("GET");
    expect(headers?.["X-CSRF-Token"]).toBeUndefined();
    expect(decodeURIComponent(url.pathname)).toContain("นิยายไทย");
    expect(url.pathname.endsWith("/comments")).toBe(true);
  });

  it("scopes a chapter thread to the chapter path", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }),
    );

    const { getChapterComments } = await import("@/lib/comments-client");
    await getChapterComments("novel-1", "ตอนที่หนึ่ง");

    const { url } = sentRequest();
    expect(decodeURIComponent(url.pathname)).toContain("/chapters/ตอนที่หนึ่ง/comments");
  });
});

describe("comment writes", () => {
  it("creates with the CSRF header and the documented body", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(commentPayload, 201));

    const { createNovelComment } = await import("@/lib/comments-client");
    const created = await createNovelComment("novel-1", "สนุกมาก");

    const { method, headers, body } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("token");
    expect(body).toEqual({ content: "สนุกมาก" });
    expect(created.id).toBe("c1");
  });

  it("replies under the parent comment", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(commentPayload, 201));

    const { replyToComment } = await import("@/lib/comments-client");
    await replyToComment("parent-id", "เห็นด้วยค่ะ");

    const { url, method } = sentRequest();
    expect(method).toBe("POST");
    expect(url.pathname).toContain("/comments/parent-id/replies");
  });

  it("edits with PATCH and deletes with the CSRF header", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(commentPayload));

    const { updateComment } = await import("@/lib/comments-client");
    await updateComment("c1", "แก้ไข");
    expect(sentRequest().method).toBe("PATCH");

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { deleteComment } = await import("@/lib/comments-client");
    await deleteComment("c1");
    const { method, headers } = sentRequest();
    expect(method).toBe("DELETE");
    expect(headers["X-CSRF-Token"]).toBe("token");
  });
});
