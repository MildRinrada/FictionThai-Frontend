/**
 * Validated environment configuration for the frontend.
 *
 * Only `NEXT_PUBLIC_*` values may appear here: everything in this file can end
 * up in the browser bundle, so it must contain no credentials whatsoever
 * (docs/14 §9, docs/11 §43).
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, so the references
 * below must be written out literally - a computed lookup would not be replaced.
 */

function readUrl(name: string, raw: string | undefined, fallback: string): string {
  const value = raw?.trim() || fallback;

  try {
    // Reject a malformed URL at startup rather than producing "undefined/api/v1"
    // request paths at runtime.
    new URL(value);
  } catch {
    throw new Error(
      `${name} must be an absolute URL such as http://localhost:8080, got "${value}"`,
    );
  }

  // Normalise away a trailing slash so path joining never double-slashes.
  return value.replace(/\/+$/, "");
}

export const env = {
  /** Base URL of the Go API. */
  apiUrl: readUrl(
    "NEXT_PUBLIC_API_URL",
    process.env.NEXT_PUBLIC_API_URL,
    "http://localhost:8080",
  ),
  /** Public origin of this web app, used for canonical URLs and metadata. */
  appUrl: readUrl(
    "NEXT_PUBLIC_APP_URL",
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3000",
  ),
  /**
   * Where the contact page sends people.
   *
   * Empty by default and deliberately not given a plausible-looking fallback:
   * an address nobody reads is worse than a page that says the channel is not
   * set up yet. The contact page renders accordingly.
   */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ?? "",
  /**
   * Whether ad slots render their reserved placeholders. ON by default (home
   * review round 2, reaffirmed): the layout must be lived-in before a real
   * network fills it, so the grey "โฆษณา" boxes are visible from day one.
   * Set NEXT_PUBLIC_ADS_ENABLED=false to collapse every slot platform-wide.
   */
  adsEnabled: process.env.NEXT_PUBLIC_ADS_ENABLED !== "false",
  isProduction: process.env.NODE_ENV === "production",
} as const;

/** The versioned API base, e.g. `http://localhost:8080/api/v1`. */
export const apiBase = `${env.apiUrl}/api/v1`;
