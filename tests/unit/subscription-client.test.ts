import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import {
  activateDemo,
  cancelSubscription,
  getPricing,
  getSubscriptionOverview,
  startCheckout,
  submitPaymentSlip,
} from "@/lib/subscription-client";

/**
 * subscription-client contract (Phase 11). Confirms mutations carry the CSRF
 * header, reads do not, the slip upload is multipart with no client-set
 * Content-Type, and API errors surface as ApiError with the code to branch on.
 */

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentRequest(): { url: string; method: string; headers: Record<string, string>; body: unknown } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  const headers = (init.headers ?? {}) as Record<string, string>;
  return { url, method: String(init.method), headers, body: init.body };
}

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    document.cookie = `${c.split("=")[0].trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  clearCookies();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("reads", () => {
  it("getPricing unwraps { mode, plans, demo } and sends no CSRF header", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          mode: "demo",
          plans: [{ code: "premium_monthly", price_minor: 9900 }],
          demo: { offered_tier: "pro", duration_days: 30 },
        },
      }),
    );
    const pricing = await getPricing();
    expect(pricing.mode).toBe("demo");
    expect(pricing.plans[0].code).toBe("premium_monthly");
    expect(pricing.demo?.offered_tier).toBe("pro");
    const { url, method, headers } = sentRequest();
    expect(method).toBe("GET");
    expect(url).toContain("/subscription/plans");
    expect(headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("getSubscriptionOverview unwraps the envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { tier: "premium", entitlements: ["premium"], subscription: null, plans: [], mode: "live" } }));
    const overview = await getSubscriptionOverview();
    expect(overview.tier).toBe("premium");
    expect(overview.entitlements).toEqual(["premium"]);
    expect(overview.mode).toBe("live");
  });
});

describe("mutations carry CSRF", () => {
  it("startCheckout posts the plan code with the CSRF header", async () => {
    document.cookie = "ft_csrf=csrf-token-123";
    fetchMock.mockResolvedValue(jsonResponse({ data: { subscription: {}, payment: {}, promptpay: {} } }));
    await startCheckout("premium_monthly");
    const { method, headers, body } = sentRequest();
    expect(method).toBe("POST");
    expect(headers["X-CSRF-Token"]).toBe("csrf-token-123");
    expect(JSON.parse(String(body))).toEqual({ plan_code: "premium_monthly" });
  });

  it("cancelSubscription posts with the CSRF header", async () => {
    document.cookie = "ft_csrf=csrf-token-123";
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "s1", status: "cancelled" } }));
    await cancelSubscription();
    expect(sentRequest().headers["X-CSRF-Token"]).toBe("csrf-token-123");
  });

  it("activateDemo posts to /subscription/demo with the CSRF header and no body", async () => {
    document.cookie = "ft_csrf=demo-csrf";
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { id: "s1", tier: "pro", status: "active", source: "demo" } }, 201),
    );
    const sub = await activateDemo();
    expect(sub.source).toBe("demo");
    const { url, method, headers } = sentRequest();
    expect(method).toBe("POST");
    expect(url).toContain("/subscription/demo");
    expect(headers["X-CSRF-Token"]).toBe("demo-csrf");
  });

  it("activateDemo surfaces a 409 (already used) as an ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "CONFLICT", message: "You have already used your free trial." } }, 409),
    );
    await expect(activateDemo()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("payment slip upload", () => {
  it("posts multipart to /media with the CSRF header and no client Content-Type", async () => {
    document.cookie = "ft_csrf=slip-csrf";
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { id: "m1", url: "/api/v1/media/m1/private", media_type: "payment_slip" } }),
    );
    const file = new File([new Uint8Array([1, 2, 3])], "slip.png", { type: "image/png" });
    const slip = await submitPaymentSlip("pay-1", file);
    expect(slip.media_type).toBe("payment_slip");

    const { url, method, headers, body } = sentRequest();
    expect(method).toBe("POST");
    expect(url).toContain("/media");
    expect(headers["X-CSRF-Token"]).toBe("slip-csrf");
    // The browser must set the multipart boundary - we must NOT set Content-Type.
    expect(headers["Content-Type"]).toBeUndefined();
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("purpose")).toBe("payment_slip");
    expect(form.get("payment")).toBe("pay-1");
  });

  it("surfaces a 422 as an ApiError with fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "bad", fields: { file: ["Only images"] } } }, 422),
    );
    const file = new File([new Uint8Array([1])], "x.txt", { type: "text/plain" });
    await expect(submitPaymentSlip("pay-1", file)).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });
  });
});

describe("error contract", () => {
  it("throws ApiError on a 409 conflict from checkout", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "CONFLICT", message: "already subscribed" } }, 409),
    );
    await expect(startCheckout("premium_monthly")).rejects.toBeInstanceOf(ApiError);
  });
});
