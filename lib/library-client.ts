"use client";

import { del, getMany, getOne, patch, post, put } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type {
  BookmarkStatus,
  ContinueReadingEntry,
  FinishedEntry,
  FollowStatus,
  FollowedAuthor,
  HistoryEntry,
  HistorySettings,
  LibraryEntry,
  LikeStatus,
  ReadingProgress,
} from "@/types/library";
import type { NovelStatus } from "@/types/novel";

/**
 * Browser-side shelf calls: bookmarks, follows, and reading progress.
 *
 * Every endpoint here requires a signed-in caller - a 401 is the API telling
 * the UI to offer sign-in, preserving the user's original intent
 * (docs/02 §5.2). Mutations carry the CSRF double-submit header because the
 * session travels as an ambient cookie (docs/11 §22).
 *
 * Repeats are idempotent on the server (docs/09 §33): bookmarking twice or
 * unfollowing someone already unfollowed is a 204, never an error, so the UI
 * can be optimistic without a reconciliation dance.
 */

/** Headers for a state-changing request from the browser. */
function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

// ---------------------------------------------------------------------------
// Bookmarks (docs/09 §18)
// ---------------------------------------------------------------------------

export async function bookmarkNovel(novelRef: string): Promise<void> {
  await post(`/novels/${encodeURIComponent(novelRef)}/bookmark`, undefined, {
    headers: mutationHeaders(),
  });
}

/** Always works, even for a fiction that has since gone private (docs/01 §11). */
export async function removeBookmark(novelRef: string): Promise<void> {
  await del(`/novels/${encodeURIComponent(novelRef)}/bookmark`, {
    headers: mutationHeaders(),
  });
}

export async function getBookmarkStatus(novelRef: string): Promise<BookmarkStatus> {
  return getOne<BookmarkStatus>(`/novels/${encodeURIComponent(novelRef)}/bookmark`);
}

// ---------------------------------------------------------------------------
// Fiction likes (docs/01 §20.2, docs/PHASE-12-STORY-DEPTH.md §12C)
// ---------------------------------------------------------------------------

/** Idempotent: liking twice leaves exactly one like. */
export async function likeNovel(novelRef: string): Promise<void> {
  await post(`/novels/${encodeURIComponent(novelRef)}/reaction`, undefined, {
    headers: mutationHeaders(),
  });
}

/** Always works, for the same reason removing a bookmark always does. */
export async function unlikeNovel(novelRef: string): Promise<void> {
  await del(`/novels/${encodeURIComponent(novelRef)}/reaction`, {
    headers: mutationHeaders(),
  });
}

export async function getLikeStatus(novelRef: string): Promise<LikeStatus> {
  return getOne<LikeStatus>(`/novels/${encodeURIComponent(novelRef)}/reaction`);
}

/**
 * The caller's shelf, newest first. `status` narrows to one section - the
 * library's "Completed" shelf is `status: "completed"` (docs/03 §13).
 */
export async function getLibrary(
  query: { status?: NovelStatus; page?: number } = {},
): Promise<{ items: LibraryEntry[]; meta: ApiMeta }> {
  return getMany<LibraryEntry>("/me/library", { query: { ...query } });
}

// ---------------------------------------------------------------------------
// Follows (docs/09 §19)
// ---------------------------------------------------------------------------

export async function followUser(userId: string): Promise<void> {
  await post(`/users/${encodeURIComponent(userId)}/follow`, undefined, {
    headers: mutationHeaders(),
  });
}

export async function unfollowUser(userId: string): Promise<void> {
  await del(`/users/${encodeURIComponent(userId)}/follow`, {
    headers: mutationHeaders(),
  });
}

export async function getFollowStatus(userId: string): Promise<FollowStatus> {
  return getOne<FollowStatus>(`/users/${encodeURIComponent(userId)}/follow-status`);
}

export async function getFollowing(
  query: { page?: number } = {},
): Promise<{ items: FollowedAuthor[]; meta: ApiMeta }> {
  return getMany<FollowedAuthor>("/me/following", { query: { ...query } });
}

// ---------------------------------------------------------------------------
// Reading progress (docs/09 §17)
// ---------------------------------------------------------------------------

/**
 * Saves the caller's position. Callers are expected to DEBOUNCE - the tracker
 * component saves on an interval and on leave, never per scroll event
 * (docs/09 §17 "The server should avoid excessive database writes").
 */
export async function saveProgress(
  novelRef: string,
  input: { chapter_id: string; progress_percent: number },
): Promise<ReadingProgress> {
  return put<ReadingProgress>(
    `/novels/${encodeURIComponent(novelRef)}/progress`,
    input,
    { headers: mutationHeaders() },
  );
}

/** The caller's position in one fiction; 404 when they have not started it. */
export async function getNovelProgress(novelRef: string): Promise<ReadingProgress> {
  return getOne<ReadingProgress>(`/novels/${encodeURIComponent(novelRef)}/progress`);
}

/** The caller's most recent positions - "Continue Reading" (docs/08 §18.1). */
export async function getContinueReading(
  query: { page?: number } = {},
): Promise<{ items: ContinueReadingEntry[]; meta: ApiMeta }> {
  return getMany<ContinueReadingEntry>("/me/reading-progress", { query: { ...query } });
}

/** Removes the caller's position in one fiction - เอาออก/เก็บกวาด. */
export async function deleteProgress(novelRef: string): Promise<void> {
  await del(`/novels/${encodeURIComponent(novelRef)}/progress`, {
    headers: mutationHeaders(),
  });
}

// ---------------------------------------------------------------------------
// The library redesign (library review 2026-08)
// ---------------------------------------------------------------------------

/** Flips the per-follow notification switch. */
export async function setFollowNotify(
  userId: string,
  notify: boolean,
): Promise<void> {
  await patch(`/users/${encodeURIComponent(userId)}/follow`, {
    notify_new_chapters: notify,
  }, { headers: mutationHeaders() });
}

/**
 * Records (or edits) the caller's PRIVATE finished mark. Upserting keeps the
 * original finished date - editing a note is not re-reading the fiction.
 */
export async function markFinished(
  novelRef: string,
  input: { stars?: number | null; note?: string | null } = {},
): Promise<void> {
  await put(`/novels/${encodeURIComponent(novelRef)}/finished`, input, {
    headers: mutationHeaders(),
  });
}

export async function unmarkFinished(novelRef: string): Promise<void> {
  await del(`/novels/${encodeURIComponent(novelRef)}/finished`, {
    headers: mutationHeaders(),
  });
}

export async function getFinished(
  query: { page?: number } = {},
): Promise<{ items: FinishedEntry[]; meta: ApiMeta }> {
  return getMany<FinishedEntry>("/me/finished", { query: { ...query } });
}

/** The caller's reading history. Owner-only by route - never public. */
export async function getHistory(
  query: { page?: number } = {},
): Promise<{ items: HistoryEntry[]; meta: ApiMeta }> {
  return getMany<HistoryEntry>("/me/history", { query: { ...query } });
}

export async function clearHistory(): Promise<void> {
  await del("/me/history", { headers: mutationHeaders() });
}

export async function getHistorySettings(): Promise<HistorySettings> {
  return getOne<HistorySettings>("/me/history/settings");
}

export async function setHistorySettings(record: boolean): Promise<HistorySettings> {
  return put<HistorySettings>("/me/history/settings", {
    record_history: record,
  }, { headers: mutationHeaders() });
}
