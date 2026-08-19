import "server-only";

import { serverGetOne } from "@/lib/api-server";
import type { PromoSlide } from "@/types/promo";

/**
 * The live slide deck for the home hero (docs/HOME-PROMO.md).
 *
 * Public and cacheable like every other home shelf; the API counts one
 * impression per serving, so the ~60s cache is also what makes the counter a
 * servings metric rather than an eyeball count - documented, not accidental.
 *
 * An empty array on ANY failure: the hero falls back to the automatic
 * "อันดับ 1" banner, and a broken promo queue must never break the front page.
 */
export async function fetchPromoSlides(): Promise<PromoSlide[]> {
  try {
    const data = await serverGetOne<{ slides: PromoSlide[] }>("/promo/slides", {
      authenticated: false,
      revalidate: 60,
    });
    return data.slides ?? [];
  } catch {
    return [];
  }
}
