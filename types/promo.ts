/**
 * The home hero's slide queue (docs/HOME-PROMO.md).
 *
 * Mirrors `backend/internal/promo`. The public view carries no counters -
 * a slide's numbers are the buyer's business, not the visitor's.
 */

/** Who put a slide in the queue. `paid` renders the "โปรโมท" chip - always. */
export type PromoSource = "editorial" | "paid" | "event";

/** Where the copy sits over the banner art. */
export type PromoTextSide = "start" | "end";

/** One slide as `GET /promo/slides` serves it. */
export interface PromoSlide {
  id: string;
  kicker?: string;
  headline: string;
  tagline?: string;
  cta_label?: string;
  /** Always an internal path - the API rejects anything else. */
  link_url: string;
  image_url?: string;
  bg_color?: string;
  text_side: PromoTextSide;
  source: PromoSource;
}

/** One slide as the staff queue reads it - everything, counters included. */
export interface AdminPromoSlide {
  id: string;
  position: number;
  kicker: string;
  headline: string;
  tagline: string;
  cta_label: string;
  link_url: string;
  image_url?: string;
  bg_color?: string;
  text_side: PromoTextSide;
  source: PromoSource;
  enabled: boolean;
  starts_at?: string;
  ends_at?: string;
  impressions: number;
  clicks: number;
  updated_at: string;
}

/** The admin form's body. */
export interface PromoSlideInput {
  kicker: string;
  headline: string;
  tagline: string;
  cta_label: string;
  link_url: string;
  image_url?: string | null;
  bg_color?: string | null;
  text_side: PromoTextSide;
  source: PromoSource;
  enabled: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

export const PROMO_SOURCE_LABELS: Record<PromoSource, string> = {
  editorial: "แอดมินเลือก",
  paid: "ซื้อพื้นที่",
  event: "อีเวนต์ของเว็บ",
};
