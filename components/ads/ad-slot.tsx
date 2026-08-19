import { env } from "@/lib/env";

/**
 * The one ad surface (home review B, 2026-08).
 *
 * Ads are not integrated yet, but the monetization plan implies they will be
 * (ad-free time is already a proposed reward, docs/MONETIZATION.md §25) - so
 * the LAYOUT is decided now, while it is cheap, instead of being wedged in
 * later and shifting every page (CLS).
 *
 * The binding rules, written down where the code is:
 *
 *   - Every slot reserves a FIXED height per breakpoint. The creative loads
 *     into space that already exists; the page never jumps.
 *   - Every slot is labelled "โฆษณา". Always. Law and trust both require it.
 *   - A viewer with an ad-free entitlement gets `null` - the space COLLAPSES,
 *     it does not sit empty. Same when ads are off platform-wide.
 *   - No slot in the hero's right column (the first place eyes land), and no
 *     slot styled as a fiction card inside a content grid - an ad a reader
 *     cannot tell from a story spends the platform's honesty on a CPM.
 *   - NEVER a sticky bottom bar, NEVER an interstitial. This audience leaves.
 *   - The reading surface has its own stricter policy: `read-end` after the
 *     chapter's last line is the ONLY permitted reader placement. Nothing is
 *     ever injected between paragraphs of someone's story.
 *
 * Adding a placement means adding it to this registry - a bare <div> ad
 * somewhere else in the tree is the bug to reject in review.
 */

// The three home slots share ONE standard height (review round 5): three
// different heights read as three broken boxes, and the tallest of them sat
// mid-page - exactly where scrolling is fastest and a 250px unit is the least
// seen and the most resented. Home is leaderboard-only; the taller rectangle
// exists solely at read-end, where the reader has genuinely stopped.
const SLOTS = {
  /** Under the hero, above the shortcut chips. Leaderboard 970×90 / 320×100. */
  "home-leaderboard": "min-h-[100px] md:min-h-[90px]",
  /** Between shelf sections, mid-page. Same standard unit. */
  "home-inline": "min-h-[100px] md:min-h-[90px]",
  /** Above the closing writer CTA - the CTA stays the last thing seen. */
  "home-footer": "min-h-[100px] md:min-h-[90px]",
  /** After a chapter's last line. The reader page's only placement. */
  "read-end": "min-h-[100px] md:min-h-[250px]",
} as const;

export type AdSlotName = keyof typeof SLOTS;

export function AdSlot({
  slot,
  /**
   * Whether THIS viewer is entitled to no ads. Resolved by the caller
   * (lib/ads-server.ts) so a cached public page decides it per request.
   */
  adFree = false,
}: {
  slot: AdSlotName;
  adFree?: boolean;
}) {
  if (!env.adsEnabled || adFree) return null;

  return (
    <div
      data-ad-slot={slot}
      className={`flex items-center justify-center rounded-lg border border-border border-dashed bg-surface-secondary/40 ${SLOTS[slot]}`}
    >
      {/* The label is the placeholder: when a creative mounts it covers this,
          and until then the box says honestly what the space is for. */}
      <span className="mono-label text-text-muted">โฆษณา</span>
    </div>
  );
}
