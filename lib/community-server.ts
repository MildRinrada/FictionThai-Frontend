import "server-only";

import { ApiError } from "@/lib/api";
import { serverGetMany, serverGetOne, serverGetPublic } from "@/lib/api-server";
import {
  parseSearchInput,
  searchApiQuery,
  type SearchState,
} from "@/lib/community-search";
import type { ApiMeta } from "@/types/api";
import type {
  CommunityPost,
  DiscussedFiction,
  TrendingTag,
} from "@/types/community";

/**
 * Server-side community reads, following the fiction pages' PUBLIC FIRST
 * pattern (docs/09 §32, docs/14 §7): fetch without credentials so the public
 * feed and public posts are identical for every visitor and cacheable; only
 * a 404 retries with the visitor's cookies - the case where the audience is
 * narrower than "everyone" (a followers-only or private post, docs/11 §37).
 */

const PUBLIC_REVALIDATE_SECONDS = 30;

/** Filters a feed request beyond its page: feed, declared type, ordering. */
export interface FeedOptions {
  feed?: "attached" | "following" | "mine" | "saved";
  type?: string;
  sort?: "top";
}

function feedQuery(page: number, options: FeedOptions) {
  return {
    ...(options.feed ? { feed: options.feed } : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.sort ? { sort: options.sort } : {}),
    ...(page > 1 ? { page } : {}),
  };
}

/** The default public feed - no credentials, cacheable. */
export async function fetchPublicFeed(
  page: number,
  options: FeedOptions = {},
): Promise<{ items: CommunityPost[]; meta: ApiMeta } | null> {
  try {
    return await serverGetMany<CommunityPost>("/community/posts", {
      authenticated: false,
      revalidate: PUBLIC_REVALIDATE_SECONDS,
      query: feedQuery(page, options),
    });
  } catch {
    // A failed feed degrades to its error state, never an error page.
    return null;
  }
}

/**
 * The same feed WITH the caller's credentials - for signed-in visitors, so
 * every card arrives already knowing my_reaction and bookmarked and the like
 * button never has to re-ask per card (docs/COMMUNITY-FEED.md). Guests keep
 * the cacheable fetchPublicFeed path.
 */
export async function fetchViewerFeed(
  page: number,
  options: FeedOptions = {},
): Promise<{ items: CommunityPost[]; meta: ApiMeta } | null> {
  try {
    return await serverGetMany<CommunityPost>("/community/posts", {
      query: feedQuery(page, options),
    });
  } catch {
    return null;
  }
}

/**
 * Post search (docs/COMMUNITY-FEED.md). The typed query is parsed HERE, on
 * the server, so a shared /community?q= link reproduces the search without
 * any client JavaScript; the API sees structured params only.
 *
 * Guests get the cacheable credential-free read; signed-in visitors search
 * with credentials so from=me works and cards know their own state.
 */
export async function fetchPostSearch(
  state: SearchState,
  page: number,
  signedIn: boolean,
): Promise<{ items: CommunityPost[]; meta: ApiMeta } | null> {
  const query = {
    ...searchApiQuery(state, parseSearchInput(state.q)),
    ...(page > 1 ? { page } : {}),
  };
  try {
    if (signedIn) {
      return await serverGetMany<CommunityPost>("/search/posts", { query });
    }
    return await serverGetMany<CommunityPost>("/search/posts", {
      authenticated: false,
      revalidate: PUBLIC_REVALIDATE_SECONDS,
      query,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      // A malformed hand-edited URL is an empty result, not an error page.
      return { items: [], meta: { page: 1, per_page: 20, total: 0 } };
    }
    return null;
  }
}

/**
 * "แท็กที่กำลังพูดถึง" - one cacheable answer for everyone, like the
 * discussed panel. Empty is a real answer and renders nothing.
 */
export async function fetchTrendingTags(): Promise<TrendingTag[]> {
  try {
    return await serverGetPublic<TrendingTag[]>("/community/tags", {
      revalidate: DISCUSSED_REVALIDATE_SECONDS,
    });
  } catch {
    return [];
  }
}

/**
 * The newest public "หาเบต้า/นักเขียนร่วม" posts - the sidebar panel that
 * points at people actively looking (docs/COMMUNITY-FEED.md).
 */
export async function fetchBetaSeekers(): Promise<CommunityPost[]> {
  try {
    const result = await serverGetMany<CommunityPost>("/community/posts", {
      authenticated: false,
      revalidate: PUBLIC_REVALIDATE_SECONDS,
      query: { type: "beta_request", per_page: 3 },
    });
    return result.items;
  } catch {
    return [];
  }
}

/**
 * The fictions public posts have been about lately - the community sidebar
 * (docs/PHASE-12-STORY-DEPTH.md §12D).
 *
 * Deliberately fetched WITHOUT credentials: the API answers identically for
 * everyone, which is what lets one cached response serve the whole panel.
 * An empty list is a real answer - the panel then renders nothing rather than
 * a placeholder pretending fictions are being discussed.
 */
export async function fetchDiscussedFictions(): Promise<DiscussedFiction[]> {
  try {
    return await serverGetPublic<DiscussedFiction[]>("/community/discussed", {
      revalidate: DISCUSSED_REVALIDATE_SECONDS,
    });
  } catch {
    return [];
  }
}

// A slower cadence than the feed: the panel counts a week of posts, so it
// cannot meaningfully change from one minute to the next.
const DISCUSSED_REVALIDATE_SECONDS = 300;

/**
 * The posts that attached ONE fiction - the studio's
 * "โพสต์ชุมชนที่พูดถึงเรื่องนี้" (§13R).
 *
 * With credentials, and deliberately not cached: it is one writer's view of
 * their own studio, and the API resolves each post's audience against the
 * caller - so an author sees exactly the posts they would see in the community
 * itself, no more. An unknown or unreadable fiction ref comes back as an empty
 * page rather than an error, which is what keeps the filter from confirming
 * that a private fiction exists.
 */
export async function fetchPostsAboutNovel(
  novelRef: string,
  page: number,
): Promise<{ items: CommunityPost[]; meta: ApiMeta } | null> {
  try {
    return await serverGetMany<CommunityPost>("/community/posts", {
      query: { novel: novelRef, ...(page > 1 ? { page } : {}) },
    });
  } catch {
    return null;
  }
}

/** The caller's following feed - always personal, always with credentials. */
export async function fetchFollowingFeed(
  page: number,
): Promise<{ items: CommunityPost[]; meta: ApiMeta } | null> {
  try {
    return await serverGetMany<CommunityPost>("/community/posts", {
      query: { feed: "following", ...(page > 1 ? { page } : {}) },
    });
  } catch {
    return null;
  }
}

/** One post: public first, audience fallback; null means a real 404. */
export async function fetchCommunityPost(id: string): Promise<CommunityPost | null> {
  const path = `/community/posts/${encodeURIComponent(id)}`;
  try {
    return await serverGetPublic<CommunityPost>(path, {
      revalidate: PUBLIC_REVALIDATE_SECONDS,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || !error.isNotFound) throw error;
  }
  try {
    return await serverGetOne<CommunityPost>(path);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}
