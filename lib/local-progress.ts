/**
 * Guest reading progress, stored on the device.
 *
 * docs/03 §11: "Guest reading progress may be stored temporarily on the
 * client. Authenticated reading progress should synchronize with the server."
 * A guest's position therefore never generates a server write at all - the
 * cheapest possible progress save - and cross-device sync is what an account
 * is for (docs/01 §10).
 *
 * Only positions are stored: a novel id, a chapter id, a percentage. No
 * content, no personal data, so there is nothing sensitive to leak from
 * localStorage.
 */

export interface LocalProgress {
  novel_id: string;
  chapter_id: string;
  progress_percent: number;
  last_read_at: string;
}

const KEY_PREFIX = "ft:progress:";

/** How many guest positions to retain before evicting the oldest. */
const MAX_ENTRIES = 50;

function storageKey(novelId: string): string {
  return KEY_PREFIX + novelId;
}

function storage(): Storage | null {
  // localStorage can be absent (SSR) or throw (private mode, storage denied);
  // progress is a nicety, so every failure degrades to "no memory of this".
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalProgress(novelId: string): LocalProgress | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(storageKey(novelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalProgress;
    if (!parsed || typeof parsed.chapter_id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalProgress(
  novelId: string,
  chapterId: string,
  progressPercent: number,
): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      storageKey(novelId),
      JSON.stringify({
        novel_id: novelId,
        chapter_id: chapterId,
        progress_percent: Math.min(100, Math.max(0, progressPercent)),
        last_read_at: new Date().toISOString(),
      } satisfies LocalProgress),
    );
    evictOldest(store);
  } catch {
    // Quota exceeded or storage denied - reading continues without memory.
  }
}

/** Keeps guest storage bounded - "temporarily" is part of the requirement. */
function evictOldest(store: Storage): void {
  const entries: Array<{ key: string; lastReadAt: string }> = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    try {
      const parsed = JSON.parse(store.getItem(key) ?? "") as LocalProgress;
      entries.push({ key, lastReadAt: parsed.last_read_at ?? "" });
    } catch {
      entries.push({ key, lastReadAt: "" });
    }
  }
  if (entries.length <= MAX_ENTRIES) return;

  entries
    .sort((a, b) => a.lastReadAt.localeCompare(b.lastReadAt))
    .slice(0, entries.length - MAX_ENTRIES)
    .forEach((entry) => store.removeItem(entry.key));
}
