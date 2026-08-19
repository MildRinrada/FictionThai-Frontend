"use client";

import { del, getMany, getOne, patch, post, put } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type { FictionFormat } from "@/types/fiction";
import type { VariableInput, VariablesResult } from "@/types/variable";
import type {
  Chapter,
  ChapterSummary,
  CollaboratorCredit,
  CreateNovelRequest,
  FormatChangeResult,
  Novel,
  NovelListQuery,
  UpdateNovelRequest,
} from "@/types/novel";

/**
 * Browser-side fiction and chapter calls.
 *
 * Every mutation carries the CSRF double-submit header, because the session
 * travels as an ambient cookie in the browser (docs/11 §22). Reads do not:
 * they change nothing, and requiring a token would break guest reading.
 *
 * Nothing here enforces authorization. The API decides what a caller may see
 * and do; hiding a control in the UI is presentation, not security
 * (docs/07 §5, docs/11 §43).
 */

/** Headers for a state-changing request from the browser. */
function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/**
 * Lists fictions.
 *
 * Filters are passed through as-is; the SERVER validates them against the
 * supported vocabulary and returns 422 for anything else, so this client never
 * duplicates the allowlist (docs/09 §11).
 */
export async function listNovels(
  query: NovelListQuery = {},
): Promise<{ items: Novel[]; meta: ApiMeta }> {
  return getMany<Novel>("/novels", { query: { ...query } });
}

/** Fetches one fiction by slug or id. */
export async function getNovel(ref: string): Promise<Novel> {
  return getOne<Novel>(`/novels/${encodeURIComponent(ref)}`);
}

/** Creates a fiction. Omitted format dimensions take their server defaults. */
export async function createNovel(input: CreateNovelRequest): Promise<Novel> {
  return post<Novel>("/novels", input, { headers: mutationHeaders() });
}

/**
 * Updates fiction metadata.
 *
 * It deliberately cannot change the format: that has its own endpoint so the
 * resulting format state is validated as a whole (docs/09 §15).
 */
export async function updateNovel(
  ref: string,
  input: UpdateNovelRequest,
): Promise<Novel> {
  return patch<Novel>(`/novels/${encodeURIComponent(ref)}`, input, {
    headers: mutationHeaders(),
  });
}

/**
 * Changes format dimensions.
 *
 * Send only the dimensions being changed. An omitted dimension keeps its
 * current value and is never silently reset (docs/09 §14.7).
 *
 * This is metadata-only: it never converts prose into chat messages or the
 * reverse. If the result needs chat content the author has not written yet, the
 * response says so via `needs_chat_setup` - a warning, not a trigger
 * (docs/08 §3.1, §11).
 */
export async function updateNovelFormat(
  ref: string,
  patchInput: Partial<FictionFormat>,
): Promise<FormatChangeResult> {
  return patch<FormatChangeResult>(
    `/novels/${encodeURIComponent(ref)}/format`,
    patchInput,
    { headers: mutationHeaders() },
  );
}

/**
 * Replaces a fiction's WHOLE reader-variable list
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * A PUT of the whole list rather than per-row routes, because order is the
 * order a reader is asked in: a partial update could leave two variables
 * claiming one position and the reader being asked a question twice.
 *
 * It writes NO chapter content. Renaming a token here does not rewrite the text
 * that uses the old one - the response's `usage` says so instead.
 */
export async function saveVariables(
  ref: string,
  variables: VariableInput[],
): Promise<VariablesResult> {
  return put<VariablesResult>(
    `/novels/${encodeURIComponent(ref)}/variables`,
    { variables },
    { headers: mutationHeaders() },
  );
}

/** Soft-deletes a fiction (docs/08 §37). */
export async function deleteNovel(ref: string): Promise<void> {
  await del(`/novels/${encodeURIComponent(ref)}`, { headers: mutationHeaders() });
}

/** The fiction's co-writer list, for its settings page (13U). */
export async function listCollaborators(
  ref: string,
): Promise<{ collaborators: CollaboratorCredit[] }> {
  return getOne<{ collaborators: CollaboratorCredit[] }>(
    `/novels/${encodeURIComponent(ref)}/collaborators`,
  );
}

/**
 * Adds a co-writer by username (13U). Owner only; the API refuses the rest.
 * Returns the resulting list, so the UI renders what the server holds.
 */
export async function addCollaborator(
  ref: string,
  username: string,
  credit?: string,
): Promise<{ collaborators: CollaboratorCredit[] }> {
  return post<{ collaborators: CollaboratorCredit[] }>(
    `/novels/${encodeURIComponent(ref)}/collaborators`,
    { username, credit: credit ?? "" },
    { headers: mutationHeaders() },
  );
}

/** Removes a co-writer. Their past writing stays exactly where it is. */
export async function removeCollaborator(ref: string, username: string): Promise<void> {
  await del(
    `/novels/${encodeURIComponent(ref)}/collaborators/${encodeURIComponent(username)}`,
    { headers: mutationHeaders() },
  );
}

/** Lists a fiction's chapters. A reader sees published ones; the owner sees all. */
export async function listChapters(
  novelRef: string,
): Promise<{ items: ChapterSummary[]; meta: ApiMeta }> {
  return getMany<ChapterSummary>(`/novels/${encodeURIComponent(novelRef)}/chapters`);
}

/** Fetches one chapter with the content the caller is entitled to. */
export async function getChapter(
  novelRef: string,
  chapterRef: string,
): Promise<Chapter> {
  return getOne<Chapter>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}`,
  );
}

/** A chapter create or update body. */
export interface ChapterInput {
  title?: string | null;
  content?: string | null;
  /**
   * Replaces the WHOLE conversation when present; omit it to leave the existing
   * messages untouched. Positions are assigned by the server from array order,
   * so none is sent (docs/CONTENT-MODEL.md §4).
   */
  messages?: Array<{
    speaker_name?: string;
    speaker_avatar_url?: string;
    message_type?: string;
    content: string;
    metadata?: { side?: "left" | "right" };
  }>;
  /**
   * Replaces the WHOLE topic when present, exactly as `messages` does. Positions
   * are assigned by the server from array order, so none is sent (12F).
   */
  entries?: Array<{
    character_id?: string | null;
    name: string;
    values?: string[];
    body?: string;
    /**
     * The entry's picture (§13M). The whole topic is replaced on every save, so
     * an omitted or empty value clears it rather than keeping what was there.
     */
    image_url?: string | null;
  }>;
  /** The topic's field labels. A present list replaces the whole set. */
  entry_fields?: string[];
  /**
   * The number the writer chose (§13R). CREATE only, and only when they moved
   * it off the suggestion: omitted, the server appends after the highest
   * existing number. A number already in use is refused with 409
   * CHAPTER_NUMBER_TAKEN rather than quietly moved to the end.
   */
  chapter_number?: number;
  /**
   * What THIS chapter renders as (§13J). The empty string means "follow the
   * fiction"; omit the field to leave the chapter's choice alone. Only a
   * fiction with `mixed_formats` accepts a value here - the API rejects it
   * otherwise rather than storing a setting it would never honour.
   */
  presentation_format?: string;
  /**
   * How the prose is READ (§13N): "plain" or "markdown". Omit to leave the
   * chapter's own setting alone - changing it writes no content either way.
   */
  content_format?: string;
  status?: string;
  scheduled_at?: string | null;
}

export async function createChapter(
  novelRef: string,
  input: ChapterInput,
): Promise<Chapter> {
  return post<Chapter>(`/novels/${encodeURIComponent(novelRef)}/chapters`, input, {
    headers: mutationHeaders(),
  });
}

/**
 * Updates a chapter.
 *
 * Only the fields present in `input` change. Omitting `content` leaves the
 * prose alone; sending `null` clears it. The API records a revision of whatever
 * it replaces, so an edit is always recoverable (docs/CONTENT-MODEL.md §5).
 */
export async function updateChapter(
  novelRef: string,
  chapterRef: string,
  input: ChapterInput,
): Promise<Chapter> {
  return patch<Chapter>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}`,
    input,
    { headers: mutationHeaders() },
  );
}

export async function publishChapter(
  novelRef: string,
  chapterRef: string,
): Promise<Chapter> {
  return post<Chapter>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}/publish`,
    undefined,
    { headers: mutationHeaders() },
  );
}

export async function unpublishChapter(
  novelRef: string,
  chapterRef: string,
): Promise<Chapter> {
  return post<Chapter>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}/unpublish`,
    undefined,
    { headers: mutationHeaders() },
  );
}

/**
 * Rewrites the fiction's chapter order (13X). The list must name every chapter
 * exactly once; the API renumbers them to 1..N in the given order and returns
 * the fresh summaries.
 */
export async function reorderChapters(
  novelRef: string,
  chapterIDs: string[],
): Promise<ChapterSummary[]> {
  const result = await put<ChapterSummary[]>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/order`,
    { chapter_ids: chapterIDs },
    { headers: mutationHeaders() },
  );
  return result;
}

/** One history row (chat-editor review 2026-08, item 10). */
export interface ChapterRevision {
  version: number;
  title?: string | null;
  word_count: number;
  message_count: number;
  entry_count: number;
  created_at: string;
}

/** Lists a chapter's revision history, newest first. Editors only. */
export async function listRevisions(
  novelRef: string,
  chapterRef: string,
): Promise<ChapterRevision[]> {
  return getOne<ChapterRevision[]>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}/revisions`,
  );
}

/**
 * Restores a revision as the chapter's current content. The state it replaces
 * is snapshotted first, so a restore can itself be restored away - nothing is
 * ever destroyed (docs/CONTENT-MODEL.md §5).
 */
export async function restoreRevision(
  novelRef: string,
  chapterRef: string,
  version: number,
): Promise<Chapter> {
  return post<Chapter>(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}/revisions/${version}/restore`,
    undefined,
    { headers: mutationHeaders() },
  );
}

/** Soft-deletes a chapter. Its messages and revisions survive (docs/08 §37). */
export async function deleteChapter(
  novelRef: string,
  chapterRef: string,
): Promise<void> {
  await del(
    `/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapterRef)}`,
    { headers: mutationHeaders() },
  );
}
