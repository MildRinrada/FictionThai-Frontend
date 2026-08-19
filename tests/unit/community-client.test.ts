import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Browser-side community calls (docs/09 §21): mutations carry the CSRF header
 * (docs/11 §22), reads do not, ids are escaped, and the reaction pair hits
 * the documented POST/DELETE endpoints.
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

const postPayload = {
  data: {
    id: "p1",
    content: "อัปเดตงานเขียน",
    visibility: "public",
    edited: false,
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    author: { id: "u1", username: "writer" },
    comment_count: 0,
    reaction_count: 0,
    is_owner: true,
  },
};

describe("community posts", () => {
  it("lists the feed without a CSRF header and passes the feed filter", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }),
    );

    const { getCommunityPosts } = await import("@/lib/community-client");
    await getCommunityPosts({ feed: "following" });

    const { method, headers, url } = sentRequest();
    expect(method).toBe("GET");
    expect(headers?.["X-CSRF-Token"]).toBeUndefined();
    expect(url.pathname.endsWith("/community/posts")).toBe(true);
    expect(url.searchParams.get("feed")).toBe("following");
  });

  it("creates with the CSRF header and the documented body", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(postPayload, 201));

    const { createCommunityPost } = await import("@/lib/community-client");
    const created = await createCommunityPost({
      content: "อัปเดตงานเขียน",
      visibility: "followers",
    });

    const { method, headers, body } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("token");
    expect(body).toEqual({ content: "อัปเดตงานเขียน", visibility: "followers" });
    expect(created.id).toBe("p1");
  });

  it("edits with PATCH and deletes with the CSRF header", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(postPayload));

    const { updateCommunityPost } = await import("@/lib/community-client");
    await updateCommunityPost("p1", { visibility: "private" });
    expect(sentRequest().method).toBe("PATCH");

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { deleteCommunityPost } = await import("@/lib/community-client");
    await deleteCommunityPost("p1");
    const { method, headers } = sentRequest();
    expect(method).toBe("DELETE");
    expect(headers["X-CSRF-Token"]).toBe("token");
  });
});

/**
 * The attachment a post carries (docs/PHASE-12-STORY-DEPTH.md §12D).
 *
 * `reference` is the API's three-case field (docs/09 §3), and the distinction
 * between "absent" and "null" is load-bearing: an editor who cannot see the
 * attached fiction must be able to fix a typo without detaching it.
 */
describe("a post's fiction reference", () => {
  it("sends the attachment when one is given", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(postPayload, 201));

    const { createCommunityPost } = await import("@/lib/community-client");
    await createCommunityPost({
      content: "ตอนที่ 7 ปล่อยแล้ว",
      reference: { novel_id: "n1", chapter_id: "c7" },
    });

    expect(sentRequest().body).toEqual({
      content: "ตอนที่ 7 ปล่อยแล้ว",
      reference: { novel_id: "n1", chapter_id: "c7" },
    });
  });

  it("omits the key entirely when nothing is attached", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(postPayload, 201));

    const { createCommunityPost } = await import("@/lib/community-client");
    await createCommunityPost({ content: "ไม่ได้แนบอะไร" });

    expect(sentRequest().body).not.toHaveProperty("reference");
  });

  it("leaves the attachment untouched when an edit does not mention it", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(postPayload));

    const { updateCommunityPost } = await import("@/lib/community-client");
    await updateCommunityPost("p1", { content: "แก้คำผิด" });

    expect(sentRequest().body).not.toHaveProperty("reference");
  });

  it("detaches with an explicit null rather than an empty object", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse(postPayload));

    const { updateCommunityPost } = await import("@/lib/community-client");
    await updateCommunityPost("p1", { reference: null });

    const { body } = sentRequest();
    expect(body).toHaveProperty("reference");
    expect(body.reference).toBeNull();
  });
});

describe("community comments", () => {
  it("scopes the thread to the post path", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }),
    );

    const { getCommunityComments } = await import("@/lib/community-client");
    await getCommunityComments("p1");

    expect(sentRequest().url.pathname).toContain("/community/posts/p1/comments");
  });

  it("replies under the parent community comment", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "r1" } }, 201));

    const { replyToCommunityComment } = await import("@/lib/community-client");
    await replyToCommunityComment("c1", "เห็นด้วยค่ะ");

    const { url, method, headers } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("token");
    expect(url.pathname).toContain("/community/comments/c1/replies");
  });
});

describe("reactions", () => {
  it("reacts with the documented type body", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { post_id: "p1", my_reaction: "like", reaction_count: 1 } }),
    );

    const { reactToPost } = await import("@/lib/community-client");
    const state = await reactToPost("p1");

    const { method, headers, body, url } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("token");
    expect(body).toEqual({ type: "like" });
    expect(url.pathname).toContain("/community/posts/p1/reactions");
    expect(state.reaction_count).toBe(1);
  });

  it("removes a reaction with DELETE and the CSRF header", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const { removeReaction } = await import("@/lib/community-client");
    await removeReaction("p1");

    const { method, headers, url } = sentRequest();
    expect(method).toBe("DELETE");
    expect(headers["X-CSRF-Token"]).toBe("token");
    expect(url.pathname).toContain("/community/posts/p1/reactions");
  });
});
