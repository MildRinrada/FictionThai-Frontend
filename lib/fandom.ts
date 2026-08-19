/**
 * Crossover fandoms in ONE field (create review 2026-08, docs/FANDOM.md).
 *
 * The platform stores exactly what it always stored: `novels.fandom`, one
 * string, the writer's own words. A crossover writes 1-3 names into that
 * string joined by " × " - the notation the genre itself uses - and the
 * "Crossover" label is DERIVED from the count, never declared by a checkbox:
 * the same principle as the "ผสมรูปแบบ" badge, where the data is the claim.
 *
 * These helpers are the one place the convention lives; a screen that split
 * or joined by hand would eventually disagree with this one.
 */

export const FANDOM_SEPARATOR = " × ";

/** More than three and the tag stops meaning anything in search. */
export const MAX_FANDOMS = 3;

/** Mirrors the API's FandomMaxLength - the JOINED string must fit it. */
export const FANDOM_TOTAL_MAX = 120;

export function splitFandoms(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(FANDOM_SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function joinFandoms(list: string[]): string {
  return list.map((name) => name.trim()).filter(Boolean).join(FANDOM_SEPARATOR);
}

/** Two or more source works IS a crossover - no checkbox, no second field. */
export function isCrossover(value?: string | null): boolean {
  return splitFandoms(value).length >= 2;
}
