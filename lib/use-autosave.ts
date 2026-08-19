"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";

/**
 * Autosave for a settings block (settings review 2026-08, item A).
 *
 * The settings page had SIX save buttons over four forms while four other
 * blocks saved on change - a writer could not know which was which, and
 * editing three blocks then pressing one button silently lost two of them.
 * The review's chosen fix: the whole page autosaves, and each block's heading
 * answers with its own state - the same contract the chapter editor already
 * keeps.
 *
 * The hook watches the block's VALUE (compared by content, not identity, so a
 * re-render cannot retrigger it), waits for the writer to pause, then runs the
 * caller's save. A newer edit always wins: a slow response from an older save
 * cannot overwrite the state of a newer one.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface Autosave {
  state: SaveState;
  /** What went wrong, in words a writer can act on. Only set in "error". */
  error: string | null;
}

export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delay = 900,
): Autosave {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Content-keyed, because the callers build their payload object fresh every
  // render: keying the effect on identity would schedule a save per render.
  const fingerprint = JSON.stringify(value);

  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  const first = useRef(true);
  const ticket = useRef(0);

  useEffect(() => {
    if (first.current) {
      // The initial render is the SAVED state, not an edit.
      first.current = false;
      return;
    }
    const mine = ++ticket.current;
    const timer = window.setTimeout(() => {
      setState("saving");
      save(latest.current)
        .then(() => {
          if (ticket.current !== mine) return;
          setState("saved");
          setError(null);
        })
        .catch((cause: unknown) => {
          if (ticket.current !== mine) return;
          setState("error");
          setError(
            cause instanceof ApiError || cause instanceof Error
              ? cause.message
              : "บันทึกไม่สำเร็จ",
          );
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [fingerprint, save, delay]);

  return { state, error };
}
