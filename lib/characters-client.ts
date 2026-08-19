"use client";

import { del, getOne, patch, post, put } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type {
  Character,
  CreateCharacterRequest,
  UpdateCharacterRequest,
} from "@/types/character";

/**
 * Browser-side cast calls (docs/PHASE-12-STORY-DEPTH.md §12A).
 *
 * Every mutation carries the CSRF double-submit header, because the session
 * travels as an ambient cookie in the browser (docs/11 §22).
 *
 * Nothing here enforces authorization. The API decides what a caller may see
 * and do; hiding a control in the UI is presentation, not security
 * (docs/07 §5, docs/11 §43).
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

function castPath(novelRef: string): string {
  return `/novels/${encodeURIComponent(novelRef)}/characters`;
}

function characterPath(novelRef: string, characterID: string): string {
  return `${castPath(novelRef)}/${encodeURIComponent(characterID)}`;
}

/**
 * Lists a fiction's cast.
 *
 * A bare array, not a paginated collection: a cast is small, complete, and
 * author-ordered, and a page boundary must never hide a character.
 */
export async function listCharacters(novelRef: string): Promise<Character[]> {
  return getOne<Character[]>(castPath(novelRef));
}

export async function getCharacter(
  novelRef: string,
  characterID: string,
): Promise<Character> {
  return getOne<Character>(characterPath(novelRef, characterID));
}

export async function createCharacter(
  novelRef: string,
  input: CreateCharacterRequest,
): Promise<Character> {
  return post<Character>(castPath(novelRef), input, { headers: mutationHeaders() });
}

/**
 * Updates a character.
 *
 * Only the keys present in `input` change. Omitting `description` leaves the
 * backstory alone; sending `null` clears it (docs/09 §3).
 */
export async function updateCharacter(
  novelRef: string,
  characterID: string,
  input: UpdateCharacterRequest,
): Promise<Character> {
  return patch<Character>(characterPath(novelRef, characterID), input, {
    headers: mutationHeaders(),
  });
}

export async function deleteCharacter(
  novelRef: string,
  characterID: string,
): Promise<void> {
  await del(characterPath(novelRef, characterID), { headers: mutationHeaders() });
}

/**
 * Rewrites the cast order.
 *
 * The list must name every character exactly once - the API rejects a partial
 * order rather than applying half of it.
 */
export async function reorderCharacters(
  novelRef: string,
  characterIDs: string[],
): Promise<Character[]> {
  return put<Character[]>(
    `${castPath(novelRef)}/order`,
    { character_ids: characterIDs },
    { headers: mutationHeaders() },
  );
}

/** Replaces the chapters a character appears in. */
export async function setCharacterAppearances(
  novelRef: string,
  characterID: string,
  chapterIDs: string[],
): Promise<Character> {
  return put<Character>(
    `${characterPath(novelRef, characterID)}/appearances`,
    { chapter_ids: chapterIDs },
    { headers: mutationHeaders() },
  );
}
