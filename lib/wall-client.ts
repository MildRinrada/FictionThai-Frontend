"use client";

import { del, getMany, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type { WallEntry } from "@/types/shelf";

/**
 * Browser-side profile-wall calls.
 *
 * Reading is guest-first, matching the API: what people left on a page is part
 * of the page. Posting requires an account - there is no guest wall, because
 * with no fiction behind it there is no author to review a queue.
 *
 * A wall its owner switched off answers 404 with code `WALL_DISABLED`. That is
 * not an error to show: the caller renders nothing, exactly as it renders
 * nothing for a person who has no messages yet.
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/** The error code a closed wall answers with. */
export const WALL_DISABLED = "WALL_DISABLED";

export interface WallPage {
  items: WallEntry[];
  meta: ApiMeta;
}

/** One page of somebody's wall, newest first. */
export async function getWall(
  userRef: string,
  query: { page?: number } = {},
): Promise<WallPage> {
  return getMany<WallEntry>(`/users/${encodeURIComponent(userRef)}/wall`, {
    query: { ...query },
  });
}

/** Leaves a message. 401 means the visitor needs to sign in first. */
export async function postToWall(userRef: string, body: string): Promise<WallEntry> {
  return post<WallEntry>(
    `/users/${encodeURIComponent(userRef)}/wall`,
    { body },
    { headers: mutationHeaders() },
  );
}

/**
 * Removes a message. The API allows its author OR the owner of the page;
 * `can_delete` on the entry says which entries the viewer may pass here.
 * Idempotent: deleting twice is still a 204.
 */
export async function deleteWallEntry(entryId: string): Promise<void> {
  await del(`/wall/${encodeURIComponent(entryId)}`, { headers: mutationHeaders() });
}
