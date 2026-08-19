/**
 * The unsaved-work safety net (§13R, save-model review 2026-08).
 *
 * The system's copy of a chapter changes ONLY when the writer presses บันทึก,
 * เผยแพร่, or ตั้งเวลา - there is no server autosave. This is the one
 * automatic copy: written on every keystroke, to the device the writing
 * happened on, for the browser that closes, the machine that freezes, and the
 * refresh nobody meant to press.
 *
 * Three properties make it safe to have at all:
 *
 *   * **It never leaves the device.** localStorage, not a request. The platform
 *     already stores the manuscript; this is the writer's own machine keeping
 *     the version the platform has not been told about yet.
 *
 *   * **It is never authoritative.** The server's copy is the manuscript. A
 *     local draft is only ever OFFERED - the studio badges the chapter and the
 *     editor says a newer local version exists - and it is dropped the moment a
 *     save succeeds. Silently restoring it would be the platform choosing a
 *     version of an author's work for them.
 *
 *   * **It expires.** Thirty days, checked on every read and pruned on every
 *     write, so a shared machine does not accumulate somebody's drafts forever.
 */

const PREFIX = "ft:draft:";

/** How long an untouched local copy is kept. */
export const DRAFT_TTL_DAYS = 30;

const TTL_MS = DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface LocalDraft {
  novelRef: string;
  chapterSlug: string;
  title: string;
  content: string;
  /**
   * The other representations, as one JSON string - chat messages, headcanon
   * entries, and the topic's fields. Optional: prose-era drafts have none.
   */
  payload?: string;
  /** Epoch milliseconds. */
  savedAt: number;
}

function keyFor(novelRef: string, chapterSlug: string): string {
  return `${PREFIX}${novelRef}::${chapterSlug}`;
}

/** localStorage is absent on the server and can throw in private modes. */
function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): LocalDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof value.savedAt !== "number") return null;
    if (Date.now() - value.savedAt > TTL_MS) return null;
    return {
      novelRef: String(value.novelRef ?? ""),
      chapterSlug: String(value.chapterSlug ?? ""),
      title: String(value.title ?? ""),
      content: String(value.content ?? ""),
      ...(typeof value.payload === "string" ? { payload: value.payload } : {}),
      savedAt: value.savedAt,
    };
  } catch {
    // A corrupted entry is one the writer never sees offered; it is not an
    // error worth surfacing on top of whatever else went wrong.
    return null;
  }
}

/** Records the in-progress state of one chapter on this device. */
export function writeLocalDraft(draft: Omit<LocalDraft, "savedAt">): void {
  const storage = store();
  if (!storage) return;
  try {
    storage.setItem(
      keyFor(draft.novelRef, draft.chapterSlug),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // A full quota is the one case worth being quiet about: the server copy is
    // still the manuscript, and a thrown error mid-keystroke would be worse
    // than a missing safety net.
  }
}

/** The local copy, if there is a live one. */
export function readLocalDraft(
  novelRef: string,
  chapterSlug: string,
): LocalDraft | null {
  const storage = store();
  if (!storage) return null;
  const key = keyFor(novelRef, chapterSlug);
  const draft = parse(storage.getItem(key));
  if (!draft) {
    try {
      storage.removeItem(key);
    } catch {
      /* see writeLocalDraft */
    }
  }
  return draft;
}

/** Drops the local copy - what a successful save does. */
export function clearLocalDraft(novelRef: string, chapterSlug: string): void {
  const storage = store();
  if (!storage) return;
  try {
    storage.removeItem(keyFor(novelRef, chapterSlug));
  } catch {
    /* see writeLocalDraft */
  }
}

/**
 * Every live local copy for one fiction, and a prune of the expired ones.
 *
 * The studio uses it to badge which chapters have work this device has that the
 * server has not been told about.
 */
export function localDraftsFor(novelRef: string): LocalDraft[] {
  const storage = store();
  if (!storage) return [];

  const found: LocalDraft[] = [];
  const stale: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(PREFIX)) continue;
    const draft = parse(storage.getItem(key));
    if (!draft) {
      stale.push(key);
      continue;
    }
    if (draft.novelRef === novelRef) found.push(draft);
  }

  for (const key of stale) {
    try {
      storage.removeItem(key);
    } catch {
      /* see writeLocalDraft */
    }
  }

  return found;
}
