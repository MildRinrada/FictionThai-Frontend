/**
 * The reader's personal shelf, client side.
 *
 * These mirror `backend/internal/library` exactly. Everything here is
 * per-user state pointing at fiction - nothing is ever public, and every list
 * has already been filtered by the API to fictions the caller may still read
 * (docs/11 §31). The frontend renders what it is given; it never re-derives
 * visibility.
 */

import type { Author, Novel } from "@/types/novel";

/** One bookmark on the shelf (docs/09 §18 "My Library"). */
export interface LibraryEntry {
  novel: Novel;
  bookmarked_at: string;
}

/** The caller's saved position in one fiction (docs/08 §18). */
export interface ReadingProgress {
  novel_id: string;
  chapter_id: string;
  /** How far through the CHAPTER the reader is, 0–100. */
  progress_percent: number;
  last_read_at: string;
}

/** Enough of a chapter to label and link a resume point - never content. */
export interface ProgressChapterRef {
  id: string;
  chapter_number: number;
  slug: string;
  title?: string;
}

/**
 * One "Continue Reading" entry (docs/08 §18.1).
 *
 * `chapter` is null when the chapter the reader stopped at is no longer live -
 * the fiction is still shown, because nothing an author does deletes a reader's
 * progress (docs/08 §3).
 */
export interface ContinueReadingEntry {
  novel: Novel;
  chapter: ProgressChapterRef | null;
  progress_percent: number;
  last_read_at: string;

  /**
   * The three numbers the library runs on (library review 2026-08): live
   * chapters in the fiction, chapters after the stopped-at one, and chapters
   * published since the reader last read.
   */
  total_chapters: number;
  chapters_left: number;
  new_since_read: number;
}

/** One followed author - the library's "Following" section (docs/03 §13). */
export interface FollowedAuthor {
  author: Author;
  followed_at: string;

  /** When they last published a chapter the caller could read, if ever. */
  last_published_at?: string | null;
  /** How many of their public fictions are still being written. */
  writing_count: number;
  /** The per-follow notification switch. */
  notify_new_chapters: boolean;
}

/** One finished fiction, with the reader's PRIVATE star and note. */
export interface FinishedEntry {
  novel: Novel;
  finished_at: string;
  stars?: number | null;
  note?: string | null;
}

/** One reading-history row. Owner-only - never any public API. */
export interface HistoryEntry {
  novel: Novel;
  chapter: ProgressChapterRef | null;
  read_at: string;
}

/** `GET/PUT /me/history/settings`. */
export interface HistorySettings {
  record_history: boolean;
}

/** `GET /users/:id/follow-status` response (docs/09 §19). */
export interface FollowStatus {
  is_following: boolean;
}

/** `GET /novels/:ref/bookmark` response. */
export interface BookmarkStatus {
  is_bookmarked: boolean;
}

/**
 * `GET /novels/:ref/reaction` response (docs/01 §20.2).
 *
 * A like is a lightweight reaction, deliberately separate from the bookmark it
 * sits beside: saving a fiction to read later and telling its author you liked
 * it are different acts.
 */
export interface LikeStatus {
  is_liked: boolean;
}
