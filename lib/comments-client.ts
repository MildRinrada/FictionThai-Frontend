"use client";

import { del, getMany, patch, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type { Comment } from "@/types/comments";

/**
 * Browser-side comment calls (docs/09 §20).
 *
 * Reads are guest-first - no credentials required, matching the API. Writes
 * require a signed-in caller and carry the CSRF double-submit header because
 * the session travels as an ambient cookie (docs/11 §22). A 401 is the API
 * telling the UI to offer sign-in, preserving the user's intent (docs/02 §5.2).
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export interface CommentPage {
  items: Comment[];
  meta: ApiMeta;
}

/** A like/unlike's answer: the fresh total and the caller's state. */
export interface CommentLikeState {
  like_count: number;
  is_liked: boolean;
}

/** ถูกใจความคิดเห็น (comment design review 2026-08). Idempotent both ways. */
export async function likeComment(commentID: string): Promise<CommentLikeState> {
  return post<CommentLikeState>(
    `/comments/${encodeURIComponent(commentID)}/like`,
    undefined,
    { headers: mutationHeaders() },
  );
}

export async function unlikeComment(commentID: string): Promise<void> {
  await del(`/comments/${encodeURIComponent(commentID)}/like`, {
    headers: mutationHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Reads - public
// ---------------------------------------------------------------------------

/** The fiction page's own thread (top-level, fiction-scoped). */
export async function getNovelComments(
  novelRef: string,
  query: { page?: number } = {},
): Promise<CommentPage> {
  return getMany<Comment>(
    `/novels/${encodeURIComponent(novelRef)}/comments`,
    { query: { ...query } },
  );
}

/** One chapter's thread. */
export async function getChapterComments(
  novelRef: string,
  chapterRef: string,
  query: { page?: number } = {},
): Promise<CommentPage> {
  return getMany<Comment>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}/comments`,
    { query: { ...query } },
  );
}

/** One comment's replies, oldest first. */
export async function getReplies(
  commentId: string,
  query: { page?: number } = {},
): Promise<CommentPage> {
  return getMany<Comment>(
    `/comments/${encodeURIComponent(commentId)}/replies`,
    { query: { ...query } },
  );
}

// ---------------------------------------------------------------------------
// Writes - authenticated
// ---------------------------------------------------------------------------

export async function createNovelComment(
  novelRef: string,
  content: string,
  guestName?: string,
): Promise<Comment> {
  return post<Comment>(
    `/novels/${encodeURIComponent(novelRef)}/comments`,
    { content, ...(guestName ? { guest_name: guestName } : {}) },
    { headers: mutationHeaders() },
  );
}

export async function createChapterComment(
  novelRef: string,
  chapterRef: string,
  content: string,
  guestName?: string,
): Promise<Comment> {
  return post<Comment>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}/comments`,
    { content, ...(guestName ? { guest_name: guestName } : {}) },
    { headers: mutationHeaders() },
  );
}

export async function replyToComment(
  commentId: string,
  content: string,
  guestName?: string,
): Promise<Comment> {
  return post<Comment>(
    `/comments/${encodeURIComponent(commentId)}/replies`,
    { content, ...(guestName ? { guest_name: guestName } : {}) },
    { headers: mutationHeaders() },
  );
}

export async function updateComment(
  commentId: string,
  content: string,
): Promise<Comment> {
  return patch<Comment>(
    `/comments/${encodeURIComponent(commentId)}`,
    { content },
    { headers: mutationHeaders() },
  );
}

/** Idempotent on the server: deleting twice is still a 204 (docs/09 §33). */
export async function deleteComment(commentId: string): Promise<void> {
  await del(`/comments/${encodeURIComponent(commentId)}`, {
    headers: mutationHeaders(),
  });
}

// ---------------------------------------------------------------------------
// ตรวจก่อนโพสต์ - the author's review queue (§13D)
//
// The half that makes three access levels survivable. A writer who opens their
// thread to guests and is handed no way to review what arrives closes it again
// after the first bad day.
// ---------------------------------------------------------------------------

/** The comments waiting on one fiction. Owner-only; the API enforces it. */
export async function getPendingComments(
  novelRef: string,
  query: { page?: number } = {},
): Promise<CommentPage> {
  return getMany<Comment>(
    `/novels/${encodeURIComponent(novelRef)}/comments/pending`,
    { query: { ...query } },
  );
}

/** Publishes a waiting comment. */
export async function approveComment(commentId: string): Promise<Comment> {
  return post<Comment>(
    `/comments/${encodeURIComponent(commentId)}/approve`,
    {},
    { headers: mutationHeaders() },
  );
}

/**
 * Refuses a waiting comment.
 *
 * Not a delete: the row survives, so any reply it collected keeps a parent and
 * the decision leaves a trail. The person who wrote it is not told - a guest
 * has no account to tell, and telling a member invites an argument under
 * somebody else's fiction.
 */
export async function rejectComment(commentId: string): Promise<Comment> {
  return post<Comment>(
    `/comments/${encodeURIComponent(commentId)}/reject`,
    {},
    { headers: mutationHeaders() },
  );
}
