"use client";

import { ApiError, getOne, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import { apiBase } from "@/lib/env";
import type { ApiErrorBody } from "@/types/api";
import type {
  PaymentSlip,
  Subscription,
  SubscriptionCheckout,
  SubscriptionOverview,
  SubscriptionPricing,
} from "@/types/subscription";

/**
 * Browser-side Premium subscription calls (Phase 11, docs/MONETIZATION.md).
 *
 * Every mutation carries the CSRF double-submit header, the session cookie, the
 * envelope, and the ApiError contract every other client uses (docs/11 §22). No
 * card, bank, or payment-provider secret is ever handled here - Phase 1 is
 * PromptPay + a submitted slip, verified by the backend (brief §16, §18).
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/**
 * Public pricing - a guest may browse without an account. Returns the plans, the
 * current mode (so the page renders "coming soon" / "try free" / "subscribe"),
 * and the demo offer when in demo mode. Available in every mode.
 */
export async function getPricing(): Promise<SubscriptionPricing> {
  return getOne<SubscriptionPricing>("/subscription/plans");
}

/** The caller's tier, entitlements, current subscription, latest payment, plans. */
export async function getSubscriptionOverview(): Promise<SubscriptionOverview> {
  return getOne<SubscriptionOverview>("/subscription");
}

/** Begins a purchase: a pending subscription + pending payment + PromptPay QR. */
export async function startCheckout(planCode: string): Promise<SubscriptionCheckout> {
  return post<SubscriptionCheckout>(
    "/subscription/checkout",
    { plan_code: planCode },
    { headers: mutationHeaders() },
  );
}

/**
 * Activates the FREE launch demo (demo mode only). Grants a demo entitlement at
 * the configured tier with NO payment, no slip, and no verification - the backend
 * enforces demo-mode-only and one-per-user (brief §4, §6, §11). The frontend can
 * never turn this into a paid subscription.
 */
export async function activateDemo(): Promise<Subscription> {
  return post<Subscription>("/subscription/demo", undefined, {
    headers: mutationHeaders(),
  });
}

/** Cancels the caller's subscription (access continues until the period end). */
export async function cancelSubscription(): Promise<Subscription> {
  return post<Subscription>("/subscription/cancel", undefined, {
    headers: mutationHeaders(),
  });
}

/**
 * Submits a PromptPay slip for a pending payment. It uploads through the MEDIA
 * endpoint with purpose=payment_slip (the slip is stored PRIVATELY), so this is
 * a multipart request rather than JSON - the browser sets the multipart boundary,
 * so no Content-Type header is added here. The frontend can NEVER declare the
 * payment succeeded; a subscription activates only after backend verification
 * (brief §16).
 */
export async function submitPaymentSlip(
  paymentId: string,
  file: File,
): Promise<PaymentSlip> {
  const form = new FormData();
  form.append("purpose", "payment_slip");
  form.append("payment", paymentId);
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${apiBase}/media`, {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders(),
      body: form,
    });
  } catch {
    throw new ApiError(503, {
      code: "SERVICE_UNAVAILABLE",
      message: "Could not reach the API.",
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const error = (payload as { error?: ApiErrorBody } | undefined)?.error;
    throw new ApiError(
      response.status,
      error ?? { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      response.headers.get("X-Request-ID") ?? undefined,
    );
  }
  return (payload as { data: PaymentSlip }).data;
}
