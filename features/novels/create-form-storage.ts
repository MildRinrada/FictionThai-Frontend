/**
 * The create form's device-local memory (13U).
 *
 * Three keys, all localStorage, none authoritative, none leaving the device:
 *
 *   - DRAFT: the whole form, autosaved as the writer types, so a closed tab
 *     costs nothing. Cleared the moment the fiction is created.
 *   - LAST: the advanced settings from the last successful create, applied as
 *     the next form's starting point - a writer's fifth story starts from how
 *     they like their stories set up.
 *   - TEMPLATE: the same shape, saved deliberately by the writer, applied
 *     deliberately. LAST changes on every create; TEMPLATE only when asked.
 *
 * Everything is wrapped in try/catch: private browsing with storage disabled
 * degrades to a form with no memory, never to a form that cannot submit.
 */

const DRAFT_KEY = "ft:create-draft:v1";
const LAST_KEY = "ft:create-last:v1";
const TEMPLATE_KEY = "ft:create-template:v1";

export interface StoredDraft<T> {
  savedAt: string;
  state: T;
}

export function readCreateDraft<T>(): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed.savedAt !== "string" || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCreateDraft<T>(state: T): string {
  const savedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt, state }));
  } catch {
    // Storage full or disabled - the form still works, it just forgets.
  }
  return savedAt;
}

export function clearCreateDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do.
  }
}

function readSettings<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSettings<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do.
  }
}

export function readLastSettings<T>(): T | null {
  return readSettings<T>(LAST_KEY);
}

export function writeLastSettings<T>(value: T): void {
  writeSettings(LAST_KEY, value);
}

export function readTemplate<T>(): T | null {
  return readSettings<T>(TEMPLATE_KEY);
}

export function writeTemplate<T>(value: T): void {
  writeSettings(TEMPLATE_KEY, value);
}
