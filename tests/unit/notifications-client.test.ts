import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Browser-side notification calls (docs/09 §23): reads carry no CSRF header,
 * the two mutations do, and the unread badge unwraps its envelope.
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
  };
}

describe("notification reads", () => {
  it("lists without a CSRF header", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, per_page: 20, total: 0 } }),
    );

    const { getNotifications } = await import("@/lib/notifications-client");
    await getNotifications();

    const { method, headers, url } = sentRequest();
    expect(method).toBe("GET");
    expect(headers?.["X-CSRF-Token"]).toBeUndefined();
    expect(url.pathname.endsWith("/me/notifications")).toBe(true);
  });

  it("unwraps the unread count", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { unread_count: 7 } }));

    const { getUnreadCount } = await import("@/lib/notifications-client");
    const result = await getUnreadCount();

    expect(result.unread_count).toBe(7);
    expect(sentRequest().url.pathname.endsWith("/unread-count")).toBe(true);
  });
});

describe("notification mutations", () => {
  it("marks one read with the CSRF header", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { markNotificationRead } = await import("@/lib/notifications-client");
    await markNotificationRead("nt-1");

    const { method, headers, url } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("token");
    expect(url.pathname).toContain("/notifications/nt-1/read");
  });

  it("marks all read with the CSRF header", async () => {
    document.cookie = "ft_csrf=token";
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { markAllNotificationsRead } = await import("@/lib/notifications-client");
    await markAllNotificationsRead();

    const { method, headers, url } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("token");
    expect(url.pathname.endsWith("/me/notifications/read-all")).toBe(true);
  });
});
