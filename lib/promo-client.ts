"use client";

import { del, getOne, patch, post, put } from "@/lib/api";
import { apiBase } from "@/lib/env";
import { readCSRFToken } from "@/lib/auth-client";
import type { AdminPromoSlide, PromoSlideInput } from "@/types/promo";

/**
 * Browser-side promo calls (docs/HOME-PROMO.md).
 *
 * The admin CRUD carries the CSRF double-submit header like every other
 * mutation; the click ping deliberately does not - it is an anonymous public
 * counter, fired on navigation, and best-effort by design.
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/** Fire-and-forget click counter. Never blocks or delays the navigation. */
export function pingSlideClick(slideId: string): void {
  const url = `${apiBase}/promo/slides/${encodeURIComponent(slideId)}/click`;
  try {
    if (navigator.sendBeacon?.(url)) return;
  } catch {
    // Beacon refused - fall through to fetch.
  }
  void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
}

// --- Staff queue management -------------------------------------------------

export async function listPromoSlides(): Promise<AdminPromoSlide[]> {
  const data = await getOne<{ slides: AdminPromoSlide[] }>("/admin/promo/slides");
  return data.slides ?? [];
}

export async function createPromoSlide(input: PromoSlideInput): Promise<AdminPromoSlide> {
  return post<AdminPromoSlide>("/admin/promo/slides", input, {
    headers: mutationHeaders(),
  });
}

export async function updatePromoSlide(
  id: string,
  input: PromoSlideInput,
): Promise<AdminPromoSlide> {
  return patch<AdminPromoSlide>(
    `/admin/promo/slides/${encodeURIComponent(id)}`,
    input,
    { headers: mutationHeaders() },
  );
}

export async function deletePromoSlide(id: string): Promise<void> {
  await del(`/admin/promo/slides/${encodeURIComponent(id)}`, {
    headers: mutationHeaders(),
  });
}

/** Rewrites the queue order from the full id list. */
export async function reorderPromoSlides(ids: string[]): Promise<AdminPromoSlide[]> {
  const data = await put<{ slides: AdminPromoSlide[] }>(
    "/admin/promo/slides/order",
    { ids },
    { headers: mutationHeaders() },
  );
  return data.slides ?? [];
}
