"use client";

import { getOne, post, put } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type {
  OwnerAchievements,
  PublicAchievements,
  SignalResult,
} from "@/types/achievement";

/**
 * Browser-side achievement calls (docs/PROFILE-AND-ACHIEVEMENTS.md Part 3).
 *
 * `signal` is the only write a page makes on its own, and it is cosmetic by
 * definition: the server keeps the allowlist of keys a browser may report, so
 * nothing here can unlock anything that implies real work.
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export async function getMyAchievements(): Promise<OwnerAchievements> {
  return getOne<OwnerAchievements>("/me/achievements");
}

export async function getAchievementsOf(user: string): Promise<PublicAchievements> {
  return getOne<PublicAchievements>(`/users/${encodeURIComponent(user)}/achievements`);
}

/** Choose the 3-5 shown on the public profile, in order. */
export async function setShowcase(keys: string[]): Promise<OwnerAchievements> {
  return put<OwnerAchievements>("/me/achievements/showcase", { keys }, {
    headers: mutationHeaders(),
  });
}

/** The global off switch. Off means nothing is counted and nothing is shown. */
export async function setAchievementsEnabled(
  enabled: boolean,
): Promise<OwnerAchievements> {
  return put<OwnerAchievements>("/me/achievements/prefs", { enabled }, {
    headers: mutationHeaders(),
  });
}

/**
 * Reports a client-side trigger. Never throws at the caller: a failed cosmetic
 * signal must not surface anywhere near the writer.
 */
export async function signalAchievement(key: string): Promise<SignalResult | null> {
  try {
    return await post<SignalResult>("/achievements/signal", { key }, {
      headers: mutationHeaders(),
    });
  } catch {
    return null;
  }
}
