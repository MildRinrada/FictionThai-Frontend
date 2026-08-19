"use client";

import { del, getMany, getOne, patch, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type {
  BookmarkState,
  CommunityComment,
  CommunityPost,
  PostReferenceInput,
  ReactionState,
  ReactionType,
  TrendingTag,
} from "@/types/community";

/**
 * Browser-side community calls (docs/09 §21).
 *
 * Reads are guest-first - visibility (public/followers/private) is enforced
 * by the API per docs/11 §37, so the client simply passes credentials and
 * renders what comes back. Writes require a signed-in caller and carry the
 * CSRF double-submit header (docs/11 §22).
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function getCommunityPosts(
  query: {
    feed?: "all" | "following" | "attached" | "mine" | "saved";
    author?: string;
    type?: string;
    page?: number;
  } = {},
): Promise<{ items: CommunityPost[]; meta: ApiMeta }> {
  return getMany<CommunityPost>("/community/posts", { query: { ...query } });
}

/**
 * Free-text post search (docs/COMMUNITY-FEED.md). Structured parameters only:
 * the operator grammar lives in lib/community-search, never on the wire. The
 * API returns PUBLIC posts alone, except inside `from=me`.
 */
export async function searchCommunityPosts(
  query: Record<string, string | number | undefined>,
): Promise<{ items: CommunityPost[]; meta: ApiMeta }> {
  return getMany<CommunityPost>("/search/posts", { query: { ...query } });
}

/** Hashtags recent public posts used most; `q` narrows by prefix (# fine). */
export async function getCommunityTags(q?: string): Promise<TrendingTag[]> {
  return getOne<TrendingTag[]>("/community/tags", { query: { q } });
}

export async function getCommunityPost(id: string): Promise<CommunityPost> {
  return getOne<CommunityPost>(`/community/posts/${encodeURIComponent(id)}`);
}

export async function createCommunityPost(input: {
  content: string;
  visibility?: string;
  /** The declared intent; omit for a plain discussion post. */
  post_type?: string;
  /** Omit to attach nothing (docs/PHASE-12-STORY-DEPTH.md §12D). */
  reference?: PostReferenceInput;
}): Promise<CommunityPost> {
  return post<CommunityPost>("/community/posts", input, {
    headers: mutationHeaders(),
  });
}

/**
 * Edits a post.
 *
 * `reference` follows the API's three-case rule (docs/09 §3): leave the key
 * out to keep the current attachment, send `null` to detach, send an object to
 * replace it. An edit that only changes the text must therefore omit it - a
 * caller that always sends the field would silently drop the card whenever it
 * could not see the attached fiction itself.
 */
export async function updateCommunityPost(
  id: string,
  input: {
    content?: string;
    visibility?: string;
    post_type?: string;
    reference?: PostReferenceInput | null;
  },
): Promise<CommunityPost> {
  return patch<CommunityPost>(
    `/community/posts/${encodeURIComponent(id)}`,
    input,
    { headers: mutationHeaders() },
  );
}

/** Idempotent on the server: deleting twice is still a 204 (docs/09 §33). */
export async function deleteCommunityPost(id: string): Promise<void> {
  await del(`/community/posts/${encodeURIComponent(id)}`, {
    headers: mutationHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function getCommunityComments(
  postId: string,
  query: { page?: number } = {},
): Promise<{ items: CommunityComment[]; meta: ApiMeta }> {
  return getMany<CommunityComment>(
    `/community/posts/${encodeURIComponent(postId)}/comments`,
    { query: { ...query } },
  );
}

export async function getCommunityReplies(
  commentId: string,
  query: { page?: number } = {},
): Promise<{ items: CommunityComment[]; meta: ApiMeta }> {
  return getMany<CommunityComment>(
    `/community/comments/${encodeURIComponent(commentId)}/replies`,
    { query: { ...query } },
  );
}

export async function createCommunityComment(
  postId: string,
  content: string,
): Promise<CommunityComment> {
  return post<CommunityComment>(
    `/community/posts/${encodeURIComponent(postId)}/comments`,
    { content },
    { headers: mutationHeaders() },
  );
}

export async function replyToCommunityComment(
  commentId: string,
  content: string,
): Promise<CommunityComment> {
  return post<CommunityComment>(
    `/community/comments/${encodeURIComponent(commentId)}/replies`,
    { content },
    { headers: mutationHeaders() },
  );
}

export async function updateCommunityComment(
  commentId: string,
  content: string,
): Promise<CommunityComment> {
  return patch<CommunityComment>(
    `/community/comments/${encodeURIComponent(commentId)}`,
    { content },
    { headers: mutationHeaders() },
  );
}

export async function deleteCommunityComment(commentId: string): Promise<void> {
  await del(`/community/comments/${encodeURIComponent(commentId)}`, {
    headers: mutationHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export async function reactToPost(
  postId: string,
  type: ReactionType = "like",
): Promise<ReactionState> {
  return post<ReactionState>(
    `/community/posts/${encodeURIComponent(postId)}/reactions`,
    { type },
    { headers: mutationHeaders() },
  );
}

/**
 * Idempotent: removing an absent reaction still succeeds. The caller keeps
 * its own optimistic count - both mutations are safe to repeat (docs/09 §33).
 */
export async function removeReaction(postId: string): Promise<void> {
  await del(`/community/posts/${encodeURIComponent(postId)}/reactions`, {
    headers: mutationHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Bookmarks (docs/COMMUNITY-FEED.md)
// ---------------------------------------------------------------------------

/** Saves a post for later; saving twice is the same bookmark. */
export async function bookmarkPost(postId: string): Promise<BookmarkState> {
  return post<BookmarkState>(
    `/community/posts/${encodeURIComponent(postId)}/bookmark`,
    undefined,
    { headers: mutationHeaders() },
  );
}

/**
 * Idempotent, and works even on a post that has since narrowed its audience.
 * The API answers with the new state, but the caller already knows it - the
 * body is deliberately ignored, like removeReaction's.
 */
export async function unbookmarkPost(postId: string): Promise<void> {
  await del(`/community/posts/${encodeURIComponent(postId)}/bookmark`, {
    headers: mutationHeaders(),
  });
}
