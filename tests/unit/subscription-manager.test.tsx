import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscriptionOverview } from "@/types/subscription";

/**
 * SubscriptionManager demo-mode behavior (demo-mode brief §10, §11, §20).
 *
 * What matters:
 *   - the demo activation button appears only when the backend says the caller
 *     is eligible, and clicking it calls activateDemo (never a payment call);
 *   - an active demo shows the trial state with its expiry and NO PromptPay/slip
 *     UI (no fake payment surface, brief §2, §20);
 *   - an expired demo shows the "back to free" state;
 *   - disabled mode shows "coming soon" with no plans;
 *   - live mode shows the paid plans and no demo UI.
 */

const getSubscriptionOverview = vi.fn();
const activateDemo = vi.fn();
const startCheckout = vi.fn();
const cancelSubscription = vi.fn();
const submitPaymentSlip = vi.fn();
const push = vi.fn();

vi.mock("@/lib/subscription-client", () => ({
  getSubscriptionOverview: (...a: unknown[]) => getSubscriptionOverview(...a),
  activateDemo: (...a: unknown[]) => activateDemo(...a),
  startCheckout: (...a: unknown[]) => startCheckout(...a),
  cancelSubscription: (...a: unknown[]) => cancelSubscription(...a),
  submitPaymentSlip: (...a: unknown[]) => submitPaymentSlip(...a),
}));

// A STABLE router object (like the real useRouter): returning a fresh object per
// render would re-run the load effect and defeat the mockResolvedValueOnce
// sequencing below.
const router = { push };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

let SubscriptionManager: typeof import("@/features/subscription/subscription-manager").SubscriptionManager;

beforeEach(async () => {
  ({ SubscriptionManager } = await import("@/features/subscription/subscription-manager"));
});

afterEach(() => {
  getSubscriptionOverview.mockReset();
  activateDemo.mockReset();
  startCheckout.mockReset();
  cancelSubscription.mockReset();
  submitPaymentSlip.mockReset();
  push.mockReset();
});

function overview(partial: Partial<SubscriptionOverview>): SubscriptionOverview {
  return {
    tier: "free",
    entitlements: [],
    subscription: null,
    plans: [],
    mode: "live",
    ...partial,
  } as SubscriptionOverview;
}

const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

describe("SubscriptionManager - demo mode", () => {
  it("offers demo activation when eligible and calls activateDemo (no payment)", async () => {
    getSubscriptionOverview
      .mockResolvedValueOnce(
        overview({
          mode: "demo",
          demo: { offered_tier: "pro", duration_days: 30, used: false, eligible: true },
        }),
      )
      // After activation, the reload shows an active demo.
      .mockResolvedValueOnce(
        overview({
          tier: "pro",
          entitlements: ["premium", "pro"],
          subscription: {
            id: "s1",
            plan_code: "pro_monthly",
            tier: "pro",
            status: "active",
            source: "demo",
            current_period_end: future,
            created_at: future,
          },
          mode: "demo",
          demo: { offered_tier: "pro", duration_days: 30, used: true, eligible: true },
        }),
      );
    activateDemo.mockResolvedValue({ id: "s1", tier: "pro", status: "active", source: "demo" });

    render(<SubscriptionManager />);

    await waitFor(() => expect(screen.getByTestId("demo-activate")).toBeInTheDocument());
    // Never a payment surface.
    expect(screen.queryByTestId("checkout-panel")).toBeNull();
    expect(screen.queryByTestId("slip-input")).toBeNull();

    fireEvent.click(screen.getByTestId("demo-activate-button").querySelector("button")!);

    await waitFor(() => expect(activateDemo).toHaveBeenCalledTimes(1));
    // The paid checkout path was never touched.
    expect(startCheckout).not.toHaveBeenCalled();
    expect(submitPaymentSlip).not.toHaveBeenCalled();

    // The active demo state renders, with the tier and no payment UI.
    await waitFor(() => expect(screen.getByTestId("demo-active")).toBeInTheDocument());
    expect(screen.getByTestId("subscription-tier")).toHaveTextContent("Pro");
    expect(screen.getByTestId("demo-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-panel")).toBeNull();
  });

  it("shows the active-demo trial state with an expiry and no fake payment UI", async () => {
    getSubscriptionOverview.mockResolvedValue(
      overview({
        tier: "pro",
        entitlements: ["premium", "pro"],
        subscription: {
          id: "s1",
          plan_code: "pro_monthly",
          tier: "pro",
          status: "active",
          source: "demo",
          current_period_end: future,
          created_at: future,
        },
        mode: "demo",
        demo: { offered_tier: "pro", duration_days: 30, used: true, eligible: false },
      }),
    );

    render(<SubscriptionManager />);

    await waitFor(() => expect(screen.getByTestId("demo-active")).toBeInTheDocument());
    expect(screen.getByTestId("demo-expires")).toBeInTheDocument();
    // A demo must never look like a paid subscription or a payment.
    expect(screen.queryByTestId("premium-active")).toBeNull();
    expect(screen.queryByTestId("checkout-panel")).toBeNull();
    expect(screen.queryByTestId("slip-input")).toBeNull();
  });

  it("shows the expired-demo state once the trial is spent", async () => {
    getSubscriptionOverview.mockResolvedValue(
      overview({
        mode: "demo",
        demo: { offered_tier: "pro", duration_days: 30, used: true, eligible: false },
      }),
    );

    render(<SubscriptionManager />);

    await waitFor(() => expect(screen.getByTestId("demo-expired")).toBeInTheDocument());
    expect(screen.queryByTestId("demo-activate")).toBeNull();
    expect(screen.getByTestId("subscription-tier")).toHaveTextContent("ฟรี");
  });
});

describe("SubscriptionManager - other modes", () => {
  it("shows a coming-soon notice and no plans in disabled mode", async () => {
    getSubscriptionOverview.mockResolvedValue(overview({ mode: "disabled" }));

    render(<SubscriptionManager />);

    await waitFor(() => expect(screen.getByTestId("subscription-disabled")).toBeInTheDocument());
    expect(screen.queryByTestId("plan-choices")).toBeNull();
    expect(screen.queryByTestId("demo-activate")).toBeNull();
  });

  it("shows the paid plans and no demo UI in live mode", async () => {
    getSubscriptionOverview.mockResolvedValue(
      overview({
        mode: "live",
        plans: [
          { code: "premium_monthly", tier: "premium", billing_period: "monthly", price_minor: 9900, currency: "THB" },
        ],
      }),
    );

    render(<SubscriptionManager />);

    await waitFor(() => expect(screen.getByTestId("plan-choices")).toBeInTheDocument());
    expect(screen.getByTestId("plan-premium_monthly")).toBeInTheDocument();
    expect(screen.queryByTestId("demo-activate")).toBeNull();
    expect(screen.queryByTestId("demo-active")).toBeNull();
  });
});
