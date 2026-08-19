/**
 * ซ่อนเนื้อหา 18+ - the reader's own switch
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13B).
 *
 * 18+ work is kept out of every browse surface by default. That default is the
 * right one for the platform and the wrong one for a reader who came looking
 * for it, so this is the switch that says "show me".
 *
 * It is stored as a COOKIE rather than in localStorage, unlike every other
 * device preference here, and the reason is structural: listings are rendered
 * on the server, and a preference the server cannot read cannot change what it
 * renders. localStorage would mean fetching the page and then re-fetching it
 * from the browser, which is a worse experience for a slower page.
 *
 * The cost is real and worth stating: a reader who turns this on leaves the
 * shared, cached listing path and gets a per-request render, because the API
 * only honours the widened listing for a signed-in caller. Everyone else keeps
 * the cached page (docs/07 §67).
 *
 * The cookie holds one character and no identity. It is not `HttpOnly` on
 * purpose - the toggle is client-side - and there is nothing in it worth
 * protecting: it says a preference, not who holds it (docs/11 §34).
 */

export const ADULT_COOKIE = "ft_show_adult";

/** One year: a reading preference should not quietly expire mid-year. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Whether a cookie value means "show me 18+ work". */
export function showsAdult(value: string | undefined): boolean {
  return value === "1";
}

/**
 * Writes the preference from the browser.
 *
 * `SameSite=Lax` because the cookie only ever affects a top-level navigation to
 * this site's own listings.
 */
export function setShowAdult(next: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = next
    ? `${ADULT_COOKIE}=1; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`
    : `${ADULT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Reads the preference from the browser, for a client island. */
export function readShowAdult(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((entry) => entry === `${ADULT_COOKIE}=1`);
}
