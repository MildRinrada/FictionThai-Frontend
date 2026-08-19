import "server-only";

import { serverGetOne, serverGetPublic } from "@/lib/api-server";
import type { Character } from "@/types/character";

/**
 * Server-side cast reads.
 *
 * The same PUBLIC FIRST pattern as the fiction itself (docs/09 §32): fetched
 * without credentials so the response is identical for every visitor and
 * cacheable, with an owner retry only when the public read 404s - the case where
 * an owner is previewing their own private work.
 *
 * A failure returns an empty cast rather than throwing: the fiction page must
 * still render if the cast call fails (docs/05 §30).
 */

const PUBLIC_REVALIDATE_SECONDS = 60;

export async function fetchCharacters(novelRef: string): Promise<Character[]> {
  const path = `/novels/${encodeURIComponent(novelRef)}/characters`;

  try {
    // The cast is a small complete set, not a paginated collection, so it comes
    // back as a bare array under `data`.
    return await serverGetPublic<Character[]>(path, {
      revalidate: PUBLIC_REVALIDATE_SECONDS,
    });
  } catch {
    // Fall through to the owner read.
  }

  try {
    // Not serverGetMany: the cast is a bare array under `data` with no
    // pagination meta, because a page boundary must never hide a cast member.
    return await serverGetOne<Character[]>(path);
  } catch {
    return [];
  }
}
