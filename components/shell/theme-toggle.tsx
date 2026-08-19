"use client";

import { useSyncExternalStore } from "react";

/**
 * The theme control.
 *
 * Three states, not two. `system` is the documented default
 * (`user_preferences.theme`, docs/08 §6.4) and it is what makes the site follow
 * the reader's phone at night without being asked - but a reader whose device
 * is dark while they want the paper theme needs a way to say so, and until this
 * control existed there was none.
 *
 * The chosen state is written as a class on <html>, which is exactly what
 * globals.css keys its `.light` / `.dark` overrides on. `system` writes no
 * class at all, leaving `prefers-color-scheme` in charge.
 */

type Choice = "system" | "light" | "dark";

const STORAGE_KEY = "ft:theme";

const OPTIONS: { value: Choice; label: string }[] = [
  { value: "system", label: "ตามอุปกรณ์" },
  { value: "light", label: "สว่าง" },
  { value: "dark", label: "มืด" },
];

/**
 * Applied before paint by the inline script in the root layout, and again here
 * on every change. Kept as one exported string so the two can never drift.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.classList.add(t)}}catch(e){}})()`;

/*
 * The choice as an external store, for the same reason as the reading
 * preferences: the server cannot know it, and copying it into state inside an
 * effect makes hydration render one thing and then immediately render another.
 */
const listeners = new Set<() => void>();
let cache: Choice | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Choice {
  if (cache === null) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      cache = stored === "light" || stored === "dark" ? stored : "system";
    } catch {
      cache = "system";
    }
  }
  return cache;
}

/** The server has no device preference, so it always renders "ตามอุปกรณ์". */
function getServerSnapshot(): Choice {
  return "system";
}

function select(next: Choice) {
  cache = next;

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (next !== "system") root.classList.add(next);

  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still holds for this page view.
  }

  for (const listener of listeners) listener();
}

/**
 * Where the control is standing.
 *
 * The footer is a dark band whatever the theme is, so its copy of this control
 * is painted on dark by hand. The account menu is a normal surface and must
 * follow the tokens like everything else on it - the same control drawn in
 * footer colours would be white text on a white popover in the light theme.
 */
type Tone = "onDark" | "onSurface";

const TONE = {
  onDark: {
    icon: "text-[#8f8a99]",
    group: "border-white/15",
    on: "bg-white/12 text-white",
    off: "text-[#a09ca8] hover:text-white",
  },
  onSurface: {
    icon: "text-text-muted",
    group: "border-border",
    on: "bg-surface-secondary text-text",
    off: "text-text-secondary hover:text-text",
  },
} satisfies Record<Tone, Record<string, string>>;

export function ThemeToggle({ tone = "onDark" }: { tone?: Tone }) {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const paint = TONE[tone];

  return (
    <div className="flex items-center gap-2">
      {/* A visible word, not a bare icon: the decorative gear that used to sit
          here read as a fourth, blank button (home review round 2). */}
      <span id="theme-label" className={`text-xs ${paint.icon}`}>
        ธีม
      </span>
      <div
        role="group"
        aria-labelledby="theme-label"
        className={`flex rounded-md border ${paint.group}`}
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={choice === option.value}
            className={`min-h-8 px-2.5 text-xs first:rounded-s-md last:rounded-e-md ${
              choice === option.value ? paint.on : paint.off
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
