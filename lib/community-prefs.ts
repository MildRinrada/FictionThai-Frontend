"use client";

/**
 * Per-device community preferences (docs/COMMUNITY-FEED.md).
 *
 * All of this is PRESENTATION state - which posts this device hides, which
 * words it mutes, which searches it remembers. None of it changes what the
 * server would answer, which is why localStorage is the right home (compare
 * lib/adult-pref.ts, which must live in a cookie for exactly the opposite
 * reason). Everything is guarded: storage being unavailable degrades to
 * "no preferences", never to a crash.
 */

const HIDDEN_KEY = "ft.community.hidden-posts";
const MUTED_KEY = "ft.community.muted-words";
const RECENT_KEY = "ft.community.recent-searches";
const SAVED_KEY = "ft.community.saved-searches";

// ---------------------------------------------------------------------------
// The store, for useSyncExternalStore
// ---------------------------------------------------------------------------
//
// localStorage IS an external store (the draft-badge precedent), so React
// components subscribe to it rather than copying it into effect-set state.
// The snapshot is cached and REPLACED on every write - useSyncExternalStore
// compares by reference, and a fresh object per read would loop forever.

/** Everything a component might render from this module, in one snapshot. */
export interface CommunityPrefsSnapshot {
  hidden: string[];
  muted: string[];
  recents: string[];
  saved: SavedSearch[];
}

const EMPTY_SNAPSHOT: CommunityPrefsSnapshot = {
  hidden: [],
  muted: [],
  recents: [],
  saved: [],
};

let cache: CommunityPrefsSnapshot | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  cache = null;
  for (const listener of listeners) listener();
}

export function subscribeCommunityPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function communityPrefsSnapshot(): CommunityPrefsSnapshot {
  cache ??= {
    hidden: readList(HIDDEN_KEY),
    muted: readList(MUTED_KEY),
    recents: readList(RECENT_KEY),
    saved: savedSearches(),
  };
  return cache;
}

/** The server (and pre-hydration) answer: no preferences. */
export function emptyCommunityPrefs(): CommunityPrefsSnapshot {
  return EMPTY_SNAPSHOT;
}

/** Recent searches keep the last 5, newest first. */
export const RECENT_SEARCH_LIMIT = 5;

/** Hidden posts cap so the list cannot grow without bound. */
const HIDDEN_LIMIT = 500;

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // A full or blocked storage loses the preference, nothing else.
  }
  notify();
}

// --- Hidden posts ----------------------------------------------------------

export function hiddenPostIds(): string[] {
  return readList(HIDDEN_KEY);
}

export function hidePost(id: string): void {
  const next = [id, ...hiddenPostIds().filter((v) => v !== id)];
  writeList(HIDDEN_KEY, next.slice(0, HIDDEN_LIMIT));
}

export function unhidePost(id: string): void {
  writeList(HIDDEN_KEY, hiddenPostIds().filter((v) => v !== id));
}

// --- Muted words -----------------------------------------------------------

export function mutedWords(): string[] {
  return readList(MUTED_KEY);
}

export function setMutedWords(words: string[]): void {
  const cleaned = words
    .map((w) => w.trim())
    .filter((w) => w !== "")
    .filter((w, i, all) => all.indexOf(w) === i)
    .slice(0, 100);
  writeList(MUTED_KEY, cleaned);
}

/** Case-insensitive substring match - Thai has no case, Latin folds. */
export function matchesMutedWord(content: string, words: string[]): string | null {
  const haystack = content.toLowerCase();
  for (const word of words) {
    if (word !== "" && haystack.includes(word.toLowerCase())) return word;
  }
  return null;
}

// --- Search history and saved searches -------------------------------------

export function recentSearches(): string[] {
  return readList(RECENT_KEY);
}

export function rememberSearch(q: string): void {
  const trimmed = q.trim();
  if (trimmed === "") return;
  const next = [trimmed, ...recentSearches().filter((v) => v !== trimmed)];
  writeList(RECENT_KEY, next.slice(0, RECENT_SEARCH_LIMIT));
}

export function clearRecentSearches(): void {
  writeList(RECENT_KEY, []);
}

/** Saved searches store the full /community?... href so filters survive. */
export interface SavedSearch {
  label: string;
  href: string;
}

export function savedSearches(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedSearch =>
        typeof v === "object" && v !== null &&
        typeof v.label === "string" && typeof v.href === "string" &&
        v.href.startsWith("/community"),
    );
  } catch {
    return [];
  }
}

export function saveSearch(entry: SavedSearch): void {
  const next = [entry, ...savedSearches().filter((v) => v.href !== entry.href)];
  writeSaved(next.slice(0, 20));
}

export function removeSavedSearch(href: string): void {
  writeSaved(savedSearches().filter((v) => v.href !== href));
}

function writeSaved(values: SavedSearch[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(values));
  } catch {
    // Same policy as writeList.
  }
  notify();
}
