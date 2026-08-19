import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscriptionPricing } from "@/types/subscription";

/**
 * PricingTable is mode-aware (demo-mode brief §9): the call-to-action reflects
 * the platform mode, and demo mode must not pretend the reader is paying.
 */

const getPricing = vi.fn();

vi.mock("@/lib/subscription-client", () => ({
  getPricing: (...a: unknown[]) => getPricing(...a),
}));

let PricingTable: typeof import("@/features/subscription/pricing-table").PricingTable;

beforeEach(async () => {
  ({ PricingTable } = await import("@/features/subscription/pricing-table"));
});

afterEach(() => {
  getPricing.mockReset();
});

function pricing(partial: Partial<SubscriptionPricing>): SubscriptionPricing {
  return {
    mode: "live",
    plans: [
      { code: "premium_monthly", tier: "premium", billing_period: "monthly", price_minor: 9900, currency: "THB" },
      { code: "pro_monthly", tier: "pro", billing_period: "monthly", price_minor: 19900, currency: "THB" },
    ],
    ...partial,
  };
}

describe("PricingTable", () => {
  it("shows a free-trial CTA and banner in demo mode, not a payment prompt", async () => {
    getPricing.mockResolvedValue(
      pricing({ mode: "demo", demo: { offered_tier: "pro", duration_days: 30 } }),
    );

    render(<PricingTable />);

    await waitFor(() => expect(screen.getByTestId("pricing-demo-banner")).toBeInTheDocument());
    const proCard = screen.getByTestId("plan-pro_monthly");
    const cta = within(proCard).getByRole("link");
    expect(cta).toHaveTextContent(/ทดลองใช้ .* ฟรี/);
    expect(cta).toHaveAttribute("href", "/account/subscription");
    // The price still shows (as the future price) but is framed as a free trial.
    expect(proCard).toHaveTextContent("199");
    expect(proCard).toHaveTextContent(/ทดลองใช้ฟรี/);
  });

  it("shows the subscribe CTA in live mode, carrying the plan code", async () => {
    getPricing.mockResolvedValue(pricing({ mode: "live" }));

    render(<PricingTable />);

    await waitFor(() => expect(screen.getByTestId("plan-premium_monthly")).toBeInTheDocument());
    const card = screen.getByTestId("plan-premium_monthly");
    const cta = within(card).getByRole("link");
    expect(cta).toHaveTextContent("สมัคร Premium");
    expect(cta).toHaveAttribute("href", "/account/subscription?plan=premium_monthly");
    expect(screen.queryByTestId("pricing-demo-banner")).toBeNull();
  });

  it("shows a coming-soon state with no active CTA link in disabled mode", async () => {
    getPricing.mockResolvedValue(pricing({ mode: "disabled" }));

    render(<PricingTable />);

    await waitFor(() => expect(screen.getByTestId("pricing-comingsoon-banner")).toBeInTheDocument());
    const card = screen.getByTestId("plan-premium_monthly");
    // No navigable CTA - nothing is purchasable.
    expect(within(card).queryByRole("link")).toBeNull();
    expect(card).toHaveTextContent("เร็ว ๆ นี้");
  });
});
