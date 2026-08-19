import "server-only";

import { cache } from "react";

import { serverGetOne } from "@/lib/api-server";
import type { Desk } from "@/types/desk";

/**
 * The writer's desk, read once per page render for the header.
 *
 * Server-side rather than from a client island on purpose. The studio badge is
 * a NUMBER NEXT TO A LINK: fetched after hydration it would appear a moment
 * late and shove the navigation sideways on every single page load, which is
 * the most-seen layout shift a site can have. Server-side it is simply part of
 * the header.
 *
 * A failure is not an error page. The desk decorates navigation; if the counter
 * is unavailable the header must still draw, so a failed read becomes "no badge
 * today" and nothing else.
 *
 * Wrapped in `cache` so the header and a page that also wants the desk (the
 * home page's writer CTA) share ONE request per render pass.
 */
export const fetchDesk = cache(async (): Promise<Desk | null> => {
  try {
    return await serverGetOne<Desk>("/me/desk");
  } catch {
    return null;
  }
});
