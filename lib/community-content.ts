/**
 * Display-time hardening for community post text (docs/COMMUNITY-FEED.md).
 *
 * The STORED content is never touched - these run at render, so the author's
 * text survives byte-for-byte and only the feed's presentation is defended.
 */

/**
 * Collapses any code point repeated more than `max` times in a row down to
 * `max` - the "ก ×500" post stops being a wall without losing its point.
 *
 * Code-point aware (`u` flag with a backreference), so Thai and emoji
 * collapse as characters, not as broken surrogate halves.
 */
export function collapseRepeats(text: string, max = 30): string {
  if (max < 1) return text;
  const runs = new RegExp(`(.)\\1{${max},}`, "gsu");
  return text.replace(runs, (_, ch: string) => ch.repeat(max));
}

/**
 * Splits `text` around case-insensitive occurrences of `needle` so the card
 * can wrap the hits in <mark>. Returns the odd indices as hits:
 * [before, hit, between, hit, after]. A blank needle returns [text].
 */
export function splitAroundMatches(text: string, needle: string): string[] {
  const trimmed = needle.trim();
  if (trimmed === "") return [text];
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return text.split(new RegExp(`(${escaped})`, "giu"));
}
