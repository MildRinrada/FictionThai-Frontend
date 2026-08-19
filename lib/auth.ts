import "server-only";

import { ApiError } from "@/lib/api";
import { serverGetOne } from "@/lib/api-server";
import type { CurrentUser } from "@/types/auth";

/**
 * Server-side current-user retrieval.
 *
 * This is the ONLY way a Server Component should learn who the visitor is. It
 * asks the API, which validates the session against the database - the frontend
 * never inspects or trusts the cookie itself (docs/11 §43).
 */

/**
 * Returns the signed-in user, or null for a guest.
 *
 * A guest is a normal outcome, not an error: guest reading is a product
 * requirement (docs/10 §2.1). Every page that calls this must still render
 * something useful when it returns null.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await serverGetOne<CurrentUser>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) {
      // No session, expired, revoked, or suspended - all mean "render as guest".
      return null;
    }
    // A genuine failure (API unreachable, 500) must not be silently reported as
    // "signed out": that would make an outage look like a mass logout. Let it
    // propagate to the nearest error boundary.
    throw error;
  }
}

/**
 * Returns the signed-in user, or null - never throwing.
 *
 * Use on pages where the identity is a nice-to-have (a header showing an avatar)
 * and an API blip should degrade to the guest view rather than blank the page.
 * Do NOT use it to guard anything: authorization is the API's job.
 */
export async function getCurrentUserOrNull(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

/**
 * Reports whether the visitor is signed in.
 *
 * Convenience for rendering decisions only. It is NOT an access-control check -
 * every protected operation is authorized server-side by the Go API, and a
 * frontend check exists purely so the UI can show the right thing.
 */
export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUserOrNull()) !== null;
}
