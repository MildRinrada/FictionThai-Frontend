import "server-only";

import { cache } from "react";

import { ApiError } from "@/lib/api";
import { serverGetMany, serverGetOne, serverGetPublic } from "@/lib/api-server";
import type { Chapter, ChapterSummary, Novel } from "@/types/novel";
import type { NovelVariable, VariablesResult } from "@/types/variable";

/**
 * Server-side fiction reads for the public pages.
 *
 * The pattern everywhere here is PUBLIC FIRST: fetch without credentials so
 * the response is identical for every visitor and cacheable for the window
 * below (docs/09 §32, docs/14 §7). Only when that answers 404 do we retry with
 * the visitor's cookies - the case where an owner previews their own private
 * or draft fiction. Readers of published work never trigger a session lookup
 * at all, which is the guest-first requirement (docs/11 §12) and keeps the
 * hottest path free of authentication work (docs/07 §67).
 *
 * A second 404 returns null; pages turn that into notFound(). Any other error
 * propagates to the error boundary - an API outage must not masquerade as a
 * missing fiction.
 */

/** Public responses may be served up to this many seconds stale. */
const PUBLIC_REVALIDATE_SECONDS = 60;

/**
 * Decodes a dynamic route parameter.
 *
 * Next delivers route params PERCENT-ENCODED exactly as they appeared in the
 * URL, and every client in `lib/` encodes references before fetching - so a
 * param passed through undecoded gets encoded twice, and a Thai chapter slug
 * 404s. Verified against the running app; do not remove without re-testing a
 * Thai slug end to end.
 *
 * A malformed sequence ("%zz") is returned as-is: it will simply not match any
 * fiction, which is the correct 404 rather than a crash.
 */
export function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function publicWithOwnerFallback<T>(
  publicFetch: () => Promise<T>,
  ownerFetch: () => Promise<T>,
): Promise<T | null> {
  try {
    return await publicFetch();
  } catch (error) {
    if (!(error instanceof ApiError) || !error.isNotFound) throw error;
  }
  try {
    return await ownerFetch();
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

export async function fetchNovel(ref: string): Promise<Novel | null> {
  const path = `/novels/${encodeURIComponent(ref)}`;
  return publicWithOwnerFallback(
    () => serverGetPublic<Novel>(path, { revalidate: PUBLIC_REVALIDATE_SECONDS }),
    () => serverGetOne<Novel>(path),
  );
}

export async function fetchChapters(novelRef: string): Promise<ChapterSummary[] | null> {
  const path = `/novels/${encodeURIComponent(novelRef)}/chapters`;
  const result = await publicWithOwnerFallback(
    () => serverGetMany<ChapterSummary>(path, { authenticated: false, revalidate: PUBLIC_REVALIDATE_SECONDS }),
    () => serverGetMany<ChapterSummary>(path),
  );
  return result?.items ?? null;
}

/**
 * The fiction as its OWNER sees it. The studio's only way to load one.
 *
 * {@link fetchNovel} asks the PUBLIC path first and falls back to the
 * authenticated one. That is right for a reader page and catastrophic for the
 * studio: the moment a fiction is published, the public path SUCCEEDS and
 * answers with the guest view - `is_owner: false`, `can_edit` absent - so the
 * studio layout's ownership check failed and served its own author a 404 for
 * their own published story. Drafts kept working (the public path 404s and the
 * fallback runs), which is why it looked like "old links broke": the fictions
 * that broke were exactly the ones that had been published.
 *
 * This fetch always carries the writer's cookies and is never cached, so the
 * answer is always about the person asking. The API decides what those cookies
 * are entitled to (docs/11 §43); this only stops us asking the wrong question.
 *
 * Wrapped in `cache` so the layout and the page under it share one request per
 * render pass - the same reason {@link fetchOwnerChapters} is.
 */
export const fetchOwnerNovel = cache(
  async (ref: string): Promise<Novel | null> => {
    try {
      return await serverGetOne<Novel>(`/novels/${encodeURIComponent(ref)}`);
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) return null;
      throw error;
    }
  },
);

/**
 * The chapter list as its OWNER sees it - drafts, schedules, everything.
 *
 * The studio must NOT use {@link fetchChapters}: that one asks the public path
 * first, and for a public fiction the public path answers with published
 * chapters only - a studio built on it shows a writer a backlog with no drafts
 * in it. This fetch always carries the writer's cookies, and the API decides
 * what those cookies are entitled to (docs/11 §43).
 *
 * Wrapped in `cache` because the studio layout and the page under it both need
 * the list in the same render pass; one request serves both, which is also what
 * guarantees their counts agree (§13T).
 *
 * An empty array on failure: a chapter list that cannot load must degrade to
 * empty sections, never take the studio down with it.
 */
export const fetchOwnerChapters = cache(
  async (novelRef: string): Promise<ChapterSummary[]> => {
    try {
      const result = await serverGetMany<ChapterSummary>(
        `/novels/${encodeURIComponent(novelRef)}/chapters`,
      );
      return result.items;
    } catch {
      return [];
    }
  },
);

/**
 * The reader-variable report as its OWNER sees it (§13H) - the declarations
 * plus the usage scan, which is the half a writer's overview needs: a token
 * typed in a chapter but never declared is the variable system's quietest bug.
 *
 * Null on failure so the overview panel simply does not render.
 */
export const fetchVariableReport = cache(
  async (novelRef: string): Promise<VariablesResult | null> => {
    try {
      return await serverGetOne<VariablesResult>(
        `/novels/${encodeURIComponent(novelRef)}/variables`,
      );
    } catch {
      return null;
    }
  },
);

/**
 * A fiction's reader variables (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * Fetched WITHOUT credentials on the public path like everything else a reader
 * sees, so one cached response serves every reader (docs/14 §7). The response
 * carries only the declarations - the answers live in the reader's browser and
 * never come near this request.
 *
 * A failure yields an empty list rather than throwing: a fiction still reads
 * with its tokens visible, and taking the chapter down because a secondary
 * request failed would be the worse outcome.
 */
export async function fetchVariables(novelRef: string): Promise<NovelVariable[]> {
  const path = `/novels/${encodeURIComponent(novelRef)}/variables`;
  try {
    const result = await publicWithOwnerFallback(
      () =>
        serverGetPublic<VariablesResult>(path, {
          revalidate: PUBLIC_REVALIDATE_SECONDS,
        }),
      () => serverGetOne<VariablesResult>(path),
    );
    return result?.variables ?? [];
  } catch {
    return [];
  }
}

export async function fetchChapter(
  novelRef: string,
  chapterRef: string,
): Promise<Chapter | null> {
  const path = `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}`;
  return publicWithOwnerFallback(
    () => serverGetPublic<Chapter>(path, { revalidate: PUBLIC_REVALIDATE_SECONDS }),
    () => serverGetOne<Chapter>(path),
  );
}
