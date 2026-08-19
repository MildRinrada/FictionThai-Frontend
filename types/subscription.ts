/**
 * FictionThai Premium subscriptions (Phase 11, docs/MONETIZATION.md).
 *
 * These mirror the Go API. The BACKEND is the source of truth for entitlement -
 * the tier here is display only; a page never grants access from it (brief §20).
 * Premium is money paid to the PLATFORM; it is entirely separate from the
 * external writer-donation link (see DonateButton), which FictionThai never
 * processes.
 */

export const SUBSCRIPTION_TIERS = ["free", "premium", "pro"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "ฟรี",
  premium: "Premium",
  pro: "Pro",
};

export type SubscriptionStatus = "pending" | "active" | "cancelled" | "expired";
export type PaymentStatus = "pending_verification" | "verified" | "rejected";
export type BillingPeriod = "monthly" | "yearly";

/** How the entitlement was obtained. A demo is NEVER proof of payment (brief §7). */
export type SubscriptionSource = "paid" | "demo";

/** The platform's monetization operating mode (brief §3). Display only - the
 * backend enforces which acquisition path is actually open. */
export type SubscriptionMode = "disabled" | "demo" | "live";

export interface SubscriptionPlan {
  code: string;
  tier: string;
  billing_period: string;
  price_minor: number;
  currency: string;
}

export interface Subscription {
  id: string;
  plan_code: string;
  tier: string;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  current_period_start?: string;
  current_period_end?: string;
  cancelled_at?: string;
  created_at: string;
}

export interface SubscriptionPayment {
  id: string;
  subscription_id: string;
  amount_minor: number;
  currency: string;
  method: string;
  status: PaymentStatus;
  has_evidence: boolean;
  evidence_url?: string;
  evidence_submitted_at?: string;
  reject_reason?: string;
  reviewed_at?: string;
  created_at: string;
}

/** How to pay a checkout. The QR pays the PLATFORM - it is NOT the user's slip. */
export interface PromptPayInstructions {
  target?: string;
  display_name?: string;
  amount_minor: number;
  currency: string;
  qr_payload?: string;
  available: boolean;
}

export interface SubscriptionCheckout {
  subscription: Subscription;
  payment: SubscriptionPayment;
  promptpay: PromptPayInstructions;
}

/** The free launch-demo offer and, in an overview, the caller's standing. */
export interface DemoOffer {
  offered_tier: string;
  duration_days: number;
  /** Whether the caller has ever used their one free trial. */
  used?: boolean;
  /** Whether the caller may activate a demo right now (server-computed). */
  eligible?: boolean;
}

/** The public pricing payload: plans, the current mode, and the demo offer. */
export interface SubscriptionPricing {
  mode: SubscriptionMode;
  plans: SubscriptionPlan[];
  demo?: DemoOffer;
}

export interface SubscriptionOverview {
  tier: string;
  entitlements: string[];
  subscription: Subscription | null;
  latest_payment?: SubscriptionPayment;
  plans: SubscriptionPlan[];
  mode: SubscriptionMode;
  demo?: DemoOffer;
}

/** True when a subscription is a free demo grant rather than a paid one. */
export function isDemo(sub: Pick<Subscription, "source"> | null | undefined): boolean {
  return sub?.source === "demo";
}

/** The media view returned when a payment slip is uploaded. */
export interface PaymentSlip {
  id: string;
  url: string;
  media_type: string;
}

/** The writer's own author profile (Phase 11 exposes only the donation link). */
export interface AuthorProfile {
  donation_url?: string;
}

/** Integer satang → a plain THB baht amount (money is never floating point). */
export function formatTHB(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString("th-TH");
}

export function periodLabel(period: string): string {
  if (period === "yearly") return "ต่อปี";
  if (period === "monthly") return "ต่อเดือน";
  return period;
}

export function tierLabel(tier: string): string {
  return TIER_LABELS[tier as SubscriptionTier] ?? tier;
}
