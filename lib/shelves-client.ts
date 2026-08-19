"use client";

import { del, getMany, patch, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { Shelf } from "@/types/shelf";

/**
 * Browser-side bookshelf calls.
 *
 * The public read needs no session at all - a shelf someone published is the
 * same for every visitor, which is why it is a separate endpoint from the
 * owner's own listing rather than the same one with extra fields.
 *
 * Everything under `/me/shelves` requires a signed-in caller; a 401 is the API
 * telling the UI to offer sign-in (docs/02 §5.2). Mutations carry the CSRF
 * double-submit header because the session travels as an ambient cookie
 * (docs/11 §22).
 *
 * There is deliberately NO call here that touches bookmarks. Publishing a shelf
 * publishes that shelf; a bookmark stays private whatever happens on this page
 * (README "Bookmarks & Personal Library").
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/** A shelf create request. Omitting `is_public` creates a PRIVATE shelf. */
export interface ShelfInput {
  name: string;
  note?: string;
  is_public?: boolean;
}

/** A partial edit: omit a field to leave it alone, send "" to clear a note. */
export interface ShelfEdit {
  name?: string;
  note?: string;
  is_public?: boolean;
  position?: number;
}

// ---------------------------------------------------------------------------
// Public read
// ---------------------------------------------------------------------------

/** One person's PUBLIC shelves. Guest-first: no credentials are needed. */
export async function getPublicShelves(userRef: string): Promise<Shelf[]> {
  const { items } = await getMany<Shelf>(
    `/users/${encodeURIComponent(userRef)}/shelves`,
  );
  return items;
}

// ---------------------------------------------------------------------------
// Owner CRUD
// ---------------------------------------------------------------------------

/** The caller's own shelves, public and private, in their chosen order. */
export async function getMyShelves(): Promise<Shelf[]> {
  const { items } = await getMany<Shelf>("/me/shelves");
  return items;
}

export async function createShelf(input: ShelfInput): Promise<Shelf> {
  return post<Shelf>("/me/shelves", input, { headers: mutationHeaders() });
}

export async function updateShelf(shelfId: string, edit: ShelfEdit): Promise<Shelf> {
  return patch<Shelf>(`/me/shelves/${encodeURIComponent(shelfId)}`, edit, {
    headers: mutationHeaders(),
  });
}

/** Removes the shelf. The fictions on it, and any bookmark of them, are untouched. */
export async function deleteShelf(shelfId: string): Promise<void> {
  await del(`/me/shelves/${encodeURIComponent(shelfId)}`, {
    headers: mutationHeaders(),
  });
}

/**
 * Puts a fiction on a shelf and returns the shelf as it now stands.
 *
 * Idempotent: adding the same fiction twice leaves one item, and a second call
 * may carry a different note.
 */
export async function addToShelf(
  shelfId: string,
  novelRef: string,
  note?: string,
): Promise<Shelf> {
  return post<Shelf>(
    `/me/shelves/${encodeURIComponent(shelfId)}/items/${encodeURIComponent(novelRef)}`,
    note ? { note } : {},
    { headers: mutationHeaders() },
  );
}

/** Always works, even for a fiction that has since gone private. */
export async function removeFromShelf(shelfId: string, novelRef: string): Promise<void> {
  await del(
    `/me/shelves/${encodeURIComponent(shelfId)}/items/${encodeURIComponent(novelRef)}`,
    { headers: mutationHeaders() },
  );
}
