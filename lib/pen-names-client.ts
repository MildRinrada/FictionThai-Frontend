"use client";

import { del, getOne, patch, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { PenNameView } from "@/types/profile";

/**
 * Browser-side pen-name calls (docs/PROFILE-AND-ACHIEVEMENTS.md Part 2).
 *
 * Self-scoped: every endpoint lives under `/me`, so there is no reference to
 * anyone else to pass and no cross-user call this module could make even by
 * mistake. The API decides everything; this file only carries JSON and the CSRF
 * header a cookie-authenticated mutation needs (docs/11 §22).
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/** The caller's own identities, the default first. */
export async function listPenNames(): Promise<PenNameView[]> {
  return getOne<PenNameView[]>("/me/pen-names");
}

export interface NewPenName {
  name: string;
  /** The writer's own label for what this identity is for. */
  note?: string | null;
  /** Ask for this one to become the fallback. The first one becomes it anyway. */
  is_default?: boolean;
}

export async function createPenName(input: NewPenName): Promise<PenNameView> {
  return post<PenNameView>("/me/pen-names", input, { headers: mutationHeaders() });
}

/**
 * A partial edit. Omit a field to leave it alone; send `note: null` to clear
 * the label. `is_default: true` moves the default here and takes it off
 * whichever identity held it, in one request.
 */
export interface PenNameEdit {
  name?: string;
  note?: string | null;
  is_default?: boolean;
}

export async function updatePenName(
  id: string,
  edit: PenNameEdit,
): Promise<PenNameView> {
  return patch<PenNameView>(`/me/pen-names/${id}`, edit, {
    headers: mutationHeaders(),
  });
}

/**
 * Removes ONE identity.
 *
 * It deletes no work: the API sets `novels.pen_name_id` to NULL, so every
 * fiction published under this name keeps every word and falls back to the
 * writer's default name. The panel says so before it calls this.
 */
export async function deletePenName(id: string): Promise<void> {
  return del(`/me/pen-names/${id}`, { headers: mutationHeaders() });
}
