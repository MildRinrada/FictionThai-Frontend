"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getPricing } from "@/lib/subscription-client";
import {
  formatTHB,
  periodLabel,
  tierLabel,
  type SubscriptionPricing,
} from "@/types/subscription";

/**
 * The public Premium pricing table (brief §9, §16). Reads plans AND the current
 * mode from the API - the prices are the database's, never hard-coded here. The
 * call-to-action adapts to the mode:
 *
 *   disabled  "เร็ว ๆ นี้" - pricing is visible but nothing is purchasable.
 *   demo      "ทดลองใช้ฟรี" - the launch demo; the price shows as the future price.
 *   live      "สมัคร Premium" - the real paid checkout.
 *
 * In demo mode the UI must NOT pretend the reader is paying (brief §9): the price
 * is labelled as the launch-period free trial, not a charge.
 */
export function PricingTable() {
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPricing()
      .then((p) => {
        if (!cancelled) setPricing(p);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof ApiError && cause.status === 503
            ? "ระบบสมาชิก Premium ยังไม่พร้อมใช้งานขณะนี้"
            : "ไม่สามารถโหลดแพ็กเกจได้ กรุณาลองใหม่",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-error">
        {error}
      </p>
    );
  }
  if (!pricing) {
    return <p className="text-sm text-text-secondary">กำลังโหลดแพ็กเกจ…</p>;
  }

  const { mode } = pricing;
  const demoTier = pricing.demo?.offered_tier;

  return (
    <>
      {mode === "demo" ? (
        <p
          className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"
          data-testid="pricing-demo-banner"
        >
          🎉 ช่วงเปิดตัว: ทดลองใช้{demoTier ? ` ${tierLabel(demoTier)} ` : ""}ฟรี{" "}
          {pricing.demo?.duration_days ? `${pricing.demo.duration_days} วัน ` : ""}
          ไม่มีค่าใช้จ่าย ราคาด้านล่างคือราคาปกติหลังเปิดตัว
        </p>
      ) : null}
      {mode === "disabled" ? (
        <p
          className="mb-4 rounded-md border border-border bg-surface-secondary p-3 text-sm text-text-secondary"
          data-testid="pricing-comingsoon-banner"
        >
          Premium กำลังจะมาเร็ว ๆ นี้
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-3" data-testid="pricing-plans">
        {pricing.plans.map((plan) => (
          <li
            key={plan.code}
            data-testid={`plan-${plan.code}`}
            className="flex flex-col rounded-md border border-border p-5"
          >
            <Badge tone={plan.tier === "pro" ? "secondary" : "primary"}>
              {tierLabel(plan.tier)}
            </Badge>
            <p className="mt-3 text-2xl font-semibold">
              {formatTHB(plan.price_minor)}{" "}
              <span className="text-sm font-normal text-text-secondary">
                {plan.currency} {periodLabel(plan.billing_period)}
              </span>
            </p>
            {mode === "demo" ? (
              <span className="mt-1 text-xs font-medium text-primary">
                ทดลองใช้ฟรีในช่วงเปิดตัว
              </span>
            ) : null}
            <PlanCTA mode={mode} tier={plan.tier} planCode={plan.code} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The mode-aware call-to-action for a plan card. */
function PlanCTA({
  mode,
  tier,
  planCode,
}: {
  mode: SubscriptionPricing["mode"];
  tier: string;
  planCode: string;
}) {
  if (mode === "disabled") {
    return (
      <span className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-text-muted">
        เร็ว ๆ นี้
      </span>
    );
  }

  // Demo grants the configured tier (chosen on the account page), so it needs no
  // plan; live preselects the chosen plan for checkout.
  const href =
    mode === "demo"
      ? "/account/subscription"
      : `/account/subscription?plan=${encodeURIComponent(planCode)}`;
  const label = mode === "demo" ? `ทดลองใช้ ${tierLabel(tier)} ฟรี` : "สมัคร Premium";
  return (
    <Link
      href={href}
      className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      {label}
    </Link>
  );
}
