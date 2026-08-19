/**
 * Reading preferences, stored on the device.
 *
 * How someone likes to read is a property of the screen they read on, not of
 * their account - a phone at night and a desktop at noon want different
 * settings. Keeping them in localStorage also means a guest gets the same
 * control as a member, which is the point of guest-first reading (docs/10 §2.1).
 *
 * Nothing here is content or personal data, so there is nothing sensitive to
 * leak from storage.
 */

export const READER_THEMES = ["paper", "sepia", "night", "dark"] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

export const READER_THEME_LABELS: Record<ReaderTheme, string> = {
  paper: "กระดาษ",
  sepia: "ซีเปีย",
  night: "กลางคืน",
  dark: "ดำสนิท",
};

export type ReaderFace = "serif" | "sans";

/** Line height presets, labelled the way a reader thinks about them. */
export const LINE_HEIGHTS = [
  { key: "tight", label: "แน่น", value: 1.7 },
  { key: "normal", label: "ปกติ", value: 1.9 },
  { key: "loose", label: "โปร่ง", value: 2.15 },
] as const;
export type LineHeightKey = (typeof LINE_HEIGHTS)[number]["key"];

/** Measure presets in px, matched to the reading tokens in globals.css. */
export const MEASURES = [
  { key: "narrow", label: "แคบ", value: 680 },
  { key: "medium", label: "กลาง", value: 820 },
  { key: "wide", label: "กว้าง", value: 960 },
] as const;
export type MeasureKey = (typeof MEASURES)[number]["key"];

export const MIN_FONT_SIZE = 15;
export const MAX_FONT_SIZE = 26;

export interface ReaderPrefs {
  fontSize: number;
  face: ReaderFace;
  lineHeight: LineHeightKey;
  measure: MeasureKey;
  theme: ReaderTheme;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontSize: 19,
  face: "serif",
  lineHeight: "normal",
  measure: "medium",
  theme: "paper",
};

const STORAGE_KEY = "ft:reader-prefs";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadReaderPrefs(): ReaderPrefs {
  const store = storage();
  if (!store) return DEFAULT_READER_PREFS;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_READER_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;

    // Each field is validated separately: a value written by an older version
    // of the app must degrade to the default rather than break the reader.
    return {
      fontSize:
        typeof parsed.fontSize === "number" &&
        parsed.fontSize >= MIN_FONT_SIZE &&
        parsed.fontSize <= MAX_FONT_SIZE
          ? parsed.fontSize
          : DEFAULT_READER_PREFS.fontSize,
      face: parsed.face === "sans" || parsed.face === "serif" ? parsed.face : "serif",
      lineHeight: LINE_HEIGHTS.some((item) => item.key === parsed.lineHeight)
        ? (parsed.lineHeight as LineHeightKey)
        : DEFAULT_READER_PREFS.lineHeight,
      measure: MEASURES.some((item) => item.key === parsed.measure)
        ? (parsed.measure as MeasureKey)
        : DEFAULT_READER_PREFS.measure,
      theme: READER_THEMES.includes(parsed.theme as ReaderTheme)
        ? (parsed.theme as ReaderTheme)
        : DEFAULT_READER_PREFS.theme,
    };
  } catch {
    return DEFAULT_READER_PREFS;
  }
}

function saveReaderPrefs(prefs: ReaderPrefs): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage denied or full - the session still honours the choice in memory.
  }
}

/*
 * Preferences as an external store.
 *
 * The reader subscribes through `useSyncExternalStore` rather than copying
 * localStorage into component state inside an effect. That is what makes the
 * server render and the hydration render agree - React reads the server
 * snapshot while hydrating and only then switches to the stored values - and it
 * keeps a single source of truth if two components ever read the preferences at
 * once.
 *
 * `cache` must be replaced, never mutated: `useSyncExternalStore` compares
 * snapshots by identity and would miss an in-place edit.
 */
let cache: ReaderPrefs | null = null;
const listeners = new Set<() => void>();

export function subscribeReaderPrefs(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getReaderPrefs(): ReaderPrefs {
  cache ??= loadReaderPrefs();
  return cache;
}

/** What the server renders: the documented defaults, never storage. */
export function getReaderPrefsServerSnapshot(): ReaderPrefs {
  return DEFAULT_READER_PREFS;
}

export function updateReaderPrefs(patch: Partial<ReaderPrefs>): void {
  cache = { ...getReaderPrefs(), ...patch };
  saveReaderPrefs(cache);
  for (const listener of listeners) listener();
}

/**
 * The CSS custom properties the reading surface reads.
 *
 * Preferences are applied as variables rather than as classes so the prose and
 * chat renderers inherit the same measure and face without either of them
 * knowing the settings exist.
 */
export function readerStyle(prefs: ReaderPrefs): Record<string, string> {
  const lineHeight =
    LINE_HEIGHTS.find((item) => item.key === prefs.lineHeight) ?? LINE_HEIGHTS[1];
  const measure = MEASURES.find((item) => item.key === prefs.measure) ?? MEASURES[1];

  return {
    "--reading-font-size": `${prefs.fontSize}px`,
    "--reading-line-height": String(lineHeight.value),
    // The subtraction keeps the reader's side gutters clear at every measure.
    "--reading-width": `min(${measure.value}px, 100vw - 2.5rem)`,
    "--reading-font-family":
      prefs.face === "serif"
        ? "var(--font-noto-serif-thai), serif"
        : "var(--font-noto-sans-thai), sans-serif",
  };
}
