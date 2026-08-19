import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { formErrors, readCSRFToken } from "@/lib/auth-client";

/**
 * Browser-side authentication behaviour.
 *
 * The security-critical assertion here is negative: the session credential must
 * never be written to any client-readable storage (docs/07 §12, docs/09 §4).
 */

const fetchMock = vi.fn();

/**
 * Removes every cookie.
 *
 * Assigning `document.cookie = ""` does NOT clear anything - the setter appends
 * a single cookie - so each one has to be expired individually. Without this,
 * cookies leak between tests and a later assertion passes for the wrong reason.
 */
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
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readCSRFToken", () => {
  it("reads the development CSRF cookie", () => {
    document.cookie = "ft_csrf=token-value";
    expect(readCSRFToken()).toBe("token-value");
  });

  it("reads the production __Host- CSRF cookie", () => {
    // The __Host- prefix cannot actually be SET over plain HTTP - jsdom
    // enforces that, exactly as a browser does - so the stored cookie header is
    // stubbed to simulate the production page, where the API set it over HTTPS.
    const spy = vi
      .spyOn(document, "cookie", "get")
      .mockReturnValue("__Host-session=opaque; __Host-csrf=prod-token");

    expect(readCSRFToken()).toBe("prod-token");

    spy.mockRestore();
  });

  it("returns null when no CSRF cookie is present", () => {
    expect(readCSRFToken()).toBeNull();
  });

  it("does not confuse the session cookie for the CSRF cookie", () => {
    document.cookie = "ft_session=a-session-token";
    expect(readCSRFToken()).toBeNull();
  });
});

describe("login", () => {
  it("declares the web client so no raw token is returned", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { user: { username: "writer" }, csrf_token: "csrf" } }),
    );

    const { login } = await import("@/lib/auth-client");
    await login({ identifier: "writer", password: "correct horse battery staple" });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.client).toBe("web");
  });

  it("sends credentials so the session cookie round-trips", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { user: {} } }));

    const { login } = await import("@/lib/auth-client");
    await login({ identifier: "writer", password: "correct horse battery staple" });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  // The whole point of the cookie transport: an XSS payload has nothing to steal.
  it("never writes a credential to client storage", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { user: { username: "writer" }, csrf_token: "csrf" } }),
    );

    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const { login } = await import("@/lib/auth-client");
    await login({ identifier: "writer", password: "correct horse battery staple" });

    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    setItem.mockRestore();
  });
});

describe("logout", () => {
  it("sends the CSRF header for a cookie-authenticated mutation", async () => {
    document.cookie = "ft_csrf=the-csrf-token";
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { logout } = await import("@/lib/auth-client");
    await logout();

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("the-csrf-token");
  });

  it("still attempts logout when no CSRF cookie exists", async () => {
    // The server rejects it; the client must not crash trying to read a cookie
    // that is not there.
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { logout } = await import("@/lib/auth-client");
    await expect(logout()).resolves.toBeUndefined();
  });
});

describe("fetchCurrentUser", () => {
  it("returns null for a guest rather than throwing", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, 401),
    );

    const { fetchCurrentUser } = await import("@/lib/auth-client");
    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("propagates a genuine failure instead of reporting a mass logout", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL_ERROR", message: "boom" } }, 500),
    );

    const { fetchCurrentUser } = await import("@/lib/auth-client");
    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("formErrors", () => {
  it("surfaces the API's per-field validation messages", () => {
    const error = new ApiError(422, {
      code: "VALIDATION_ERROR",
      message: "Validation failed.",
      fields: { username: ["This username is not available."] },
    });

    const parsed = formErrors(error);
    expect(parsed.message).toBe("Validation failed.");
    expect(parsed.fields.username).toEqual(["This username is not available."]);
  });

  it("falls back to a generic message for a non-API error", () => {
    const parsed = formErrors(new TypeError("network down"));
    expect(parsed.message).not.toContain("network down");
    expect(parsed.fields).toEqual({});
  });

  // The server is the single source of truth for validation, so the client must
  // report whatever it says rather than substituting its own rules.
  it("does not invent field errors of its own", () => {
    const error = new ApiError(401, {
      code: "INVALID_CREDENTIALS",
      message: "Invalid username or password.",
    });

    expect(formErrors(error).fields).toEqual({});
  });
});
