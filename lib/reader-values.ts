/**
 * The reader's answers, stored on the device.
 *
 * docs/PHASE-13-CREATION-AND-CONTROL.md §13H, carrying forward 12B's rule
 * unchanged: this never reaches the server. What name someone inserts into a
 * romance, and which pronouns they pick, is a sensitive preference the platform
 * has no product reason to hold - and keeping it local is also what lets a
 * GUEST use the feature at all (docs/10 §2.1).
 *
 * Two layers:
 *
 *   * per fiction, because a reader may want to be a different person in a
 *     different story;
 *   * a DEVICE-WIDE reader profile that auto-fills a new fiction's questions,
 *     so the platform's most-repeated form is answered once.
 *
 * The profile is device-wide rather than account-wide on purpose. Syncing it
 * would mean the server holding exactly the record this design exists to avoid.
 * The cost is honest and stated in the UI: a new device starts empty.
 */

const VALUE_PREFIX = "ft:vars:";
const PROFILE_KEY = "ft:reader-profile";

/** What a slot shows when nobody has answered it and the author set no default. */
export const VALUE_FALLBACK = "คุณ";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
const cache = new Map<string, Record<string, string>>();

export function subscribeReaderValues(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function read(key: string): Record<string, string> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let parsed: Record<string, string> = {};
  try {
    const raw = storage()?.getItem(key);
    if (raw) {
      const decoded: unknown = JSON.parse(raw);
      // Anything else in this key is someone else's data or a corrupted write;
      // treating it as empty is better than rendering `[object Object]` into
      // the middle of a sentence.
      if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
        for (const [token, value] of Object.entries(decoded)) {
          if (typeof value === "string") parsed[token] = value;
        }
      }
    }
  } catch {
    parsed = {};
  }
  cache.set(key, parsed);
  return parsed;
}

function write(key: string, values: Record<string, string>) {
  cache.set(key, values);
  try {
    if (Object.keys(values).length === 0) storage()?.removeItem(key);
    else storage()?.setItem(key, JSON.stringify(values));
  } catch {
    // Storage denied - the choice still holds for this page view.
  }
}

/** This fiction's answers, keyed by token. */
export function getReaderValues(novelID: string): Record<string, string> {
  return read(VALUE_PREFIX + novelID);
}

/** The server has no device preference, so it always renders the fallback. */
export function getReaderValuesServerSnapshot(): Record<string, string> {
  return EMPTY;
}
const EMPTY: Record<string, string> = {};

/**
 * The device-wide profile: answers keyed by LABEL rather than by token.
 *
 * By label because tokens are per fiction - one author's (y/n) is another's
 * (ช/ท) - while "ชื่อของคุณ" means the same thing everywhere. That is what makes
 * the auto-fill work across the platform rather than only inside one series.
 */
export function getReaderProfile(): Record<string, string> {
  return read(PROFILE_KEY);
}

export function setReaderValue(novelID: string, token: string, value: string): void {
  const key = VALUE_PREFIX + novelID;
  const next = { ...read(key) };
  const trimmed = value.trim();
  if (trimmed === "") delete next[token];
  else next[token] = trimmed;

  write(key, next);
  notify();
}

/** Remembers an answer for every future fiction that asks the same question. */
export function setReaderProfileValue(label: string, value: string): void {
  const next = { ...read(PROFILE_KEY) };
  const trimmed = value.trim();
  if (trimmed === "") delete next[label];
  else next[label] = trimmed;

  write(PROFILE_KEY, next);
  notify();
}

export function clearReaderProfile(): void {
  write(PROFILE_KEY, {});
  notify();
}

/**
 * What a slot should display, in priority order: this reader's answer for this
 * fiction, then their device profile's answer to the same question, then the
 * author's default, then the neutral fallback.
 *
 * The author's default sits BELOW the profile deliberately: a default is what
 * the author writes for a reader who has said nothing, and a reader who filled
 * in their profile has said something.
 */
export function resolveValue(
  values: Record<string, string>,
  profile: Record<string, string>,
  variable: { token: string; label: string; default_value?: string },
  token: string,
): string {
  return (
    values[token] ||
    values[variable.token] ||
    profile[variable.label] ||
    variable.default_value ||
    VALUE_FALLBACK
  );
}
