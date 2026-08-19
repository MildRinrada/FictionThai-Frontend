"use server";

import { updateTag } from "next/cache";

import { profileTag } from "@/lib/profiles-server";

/**
 * Expire one person's cached profile after they edit it.
 *
 * The save itself is a browser call straight to the Go API, so Next's data
 * cache has no idea anything changed - without this the writer saves, opens
 * their profile, sees the old one, and reasonably concludes the save failed
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
 *
 * `updateTag` rather than `revalidateTag`: this Next expires a revalidateTag
 * entry on a schedule, while updateTag gives read-your-own-writes semantics
 * inside a Server Action - which is the entire requirement here.
 *
 * It expires a cache entry and nothing else: no data is read, nothing is
 * written, and the tag is derived from the username the caller already has, so
 * the worst a bad argument can do is make someone's profile load once from the
 * API instead of from the cache.
 */
export async function refreshProfileCache(username: string): Promise<void> {
  updateTag(profileTag(username));
}
