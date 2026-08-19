import "server-only";

import { ApiError } from "@/lib/api";
import { serverGetMany, serverGetPublic } from "@/lib/api-server";
import type { ApiMeta } from "@/types/api";
import type { CommunityPost } from "@/types/community";
import type { Novel } from "@/types/novel";
import type { PublicProfile } from "@/types/profile";

/**
 * Server-side reads for a person's profile
 * (docs/PHASE-12-STORY-DEPTH.md §12E).
 *
 * All three are fetched WITHOUT credentials. That is not an oversight: the API
 * answers each of them identically for every viewer, so one cached response
 * serves the whole page (docs/14 §7). A signed-in visitor's own state - do I
 * follow this person - is asked for by a client island after mount.
 */

const REVALIDATE_SECONDS = 60;

/**
 * The cache tag for one person's profile. Editing a profile expires it, so a
 * writer who saves sees the change immediately instead of waiting out the
 * revalidation window and concluding the save failed.
 */
export function profileTag(ref: string): string {
  return `profile:${ref.toLowerCase()}`;
}

/** One profile; null means the API really said 404. */
export async function fetchPublicProfile(ref: string): Promise<PublicProfile | null> {
  try {
    return await serverGetPublic<PublicProfile>(
      `/users/${encodeURIComponent(ref)}`,
      { revalidate: REVALIDATE_SECONDS, tags: [profileTag(ref)] },
    );
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

/**
 * The person's published work, newest update first.
 *
 * The listing endpoint applies the reader rule, so this returns exactly what a
 * stranger may open - the same set `novel_count` counts.
 */
export async function fetchProfileWorks(
  username: string,
  page = 1,
  /**
   * ล่าสุด / ยอดนิยม / จบแล้ว / กำลังเขียน. The last two are FILTERS, not
   * sorts - the listing endpoint's sort vocabulary has neither - so they ask
   * for that slice ordered by its latest update. กำลังเขียน replaced the
   * separate tab (profile review 2026-08): one list, sliced, not two tabs
   * counting the same work twice.
   */
  sort: "updated" | "popular" | "completed" | "ongoing" = "updated",
  /**
   * The OWNER's own view. The listing endpoint already includes unpublished
   * work when the caller is the author, so this only decides whether to ask
   * with the session - which also makes the response personal, and therefore
   * uncacheable. A writer whose fictions are all drafts was otherwise looking
   * at an empty page with nothing to explain it
   * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
   */
  includeUnpublished = false,
): Promise<{ items: Novel[]; meta: ApiMeta } | null> {
  try {
    return await serverGetMany<Novel>("/novels", {
      authenticated: includeUnpublished,
      ...(includeUnpublished
        ? { cache: "no-store" as RequestCache }
        : { revalidate: REVALIDATE_SECONDS }),
      query: {
        author: username,
        sort: sort === "popular" ? "popular" : "updated",
        ...(sort === "completed" ? { status: "completed" } : {}),
        ...(sort === "ongoing" ? { status: "ongoing" } : {}),
        per_page: 12,
        ...(page > 1 ? { page } : {}),
      },
    });
  } catch {
    return null;
  }
}

/**
 * The person's community timeline.
 *
 * This is the ordinary community listing scoped to one author, which is
 * already audience-filtered by the API (docs/11 §37) - a followers-only post
 * stays inside its audience here exactly as it does in the feed. A second
 * endpoint would have been a second path to the same list.
 */
export async function fetchProfileTimeline(
  username: string,
  page = 1,
  /**
   * The owner asks WITH their session (profile review 2026-08): otherwise
   * their own followers-only posts were invisible on their own page - the one
   * place they would look to check what followers see exists at all.
   */
  asOwner = false,
): Promise<{ items: CommunityPost[]; meta: ApiMeta } | null> {
  try {
    return await serverGetMany<CommunityPost>("/community/posts", {
      authenticated: asOwner,
      ...(asOwner
        ? { cache: "no-store" as RequestCache }
        : { revalidate: REVALIDATE_SECONDS }),
      query: { author: username, ...(page > 1 ? { page } : {}) },
    });
  } catch {
    return null;
  }
}

/**
 * The person's PUBLIC shelves (docs/PROFILE-AND-ACHIEVEMENTS.md).
 *
 * Public by opt-in, per shelf - a reader's bookmarks stay private forever, and
 * this endpoint never sees them. Cacheable for the same reason the profile is:
 * the answer does not depend on who is asking.
 */
export async function fetchPublicShelves(username: string) {
  try {
    return await serverGetPublic<import("@/types/shelf").Shelf[]>(
      `/users/${encodeURIComponent(username)}/shelves`,
      { revalidate: REVALIDATE_SECONDS, tags: [profileTag(username)] },
    );
  } catch {
    return [];
  }
}

/** The person's showcased achievements. Viewer-independent, so cacheable. */
export async function fetchAchievements(username: string) {
  try {
    return await serverGetPublic<import("@/types/achievement").PublicAchievements>(
      `/users/${encodeURIComponent(username)}/achievements`,
      { revalidate: REVALIDATE_SECONDS, tags: [profileTag(username)] },
    );
  } catch {
    return null;
  }
}
