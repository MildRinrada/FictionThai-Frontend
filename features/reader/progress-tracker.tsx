"use client";

import { useEffect, useRef } from "react";

import { ApiError } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import { getNovelProgress, saveProgress } from "@/lib/library-client";
import { readLocalProgress, saveLocalProgress } from "@/lib/local-progress";

/**
 * Invisible reading-position recorder on the chapter page.
 *
 * This is where docs/09 §17's debounce lives: scroll positions are sampled
 * locally, and the SERVER sees at most one write per interval plus one on
 * leave. A guest generates no server traffic at all - their position goes to
 * localStorage (docs/03 §11) - and a signed-in reader's write is a single-row
 * upsert on the other end.
 *
 * It renders nothing and never blocks reading: every failure (offline, rate
 * limited, signed out mid-read) is silently dropped and retried at the next
 * interval. Progress is a convenience; the chapter is the point.
 */

/** Server saves happen at most this often (docs/09 §17). */
const SAVE_INTERVAL_MS = 20_000;

/** A position must move at least this much to be worth another write. */
const MIN_DELTA_PERCENT = 1;

export interface ProgressTrackerProps {
  novelId: string;
  chapterId: string;
}

export function ProgressTracker({ novelId, chapterId }: ProgressTrackerProps) {
  // Refs, not state: sampling scroll must never re-render the reader.
  const percentRef = useRef(0);
  const lastSavedRef = useRef(-1);

  // Signed-in is detected CLIENT-side, from the presence of the readable CSRF
  // cookie, so the chapter page itself never has to read the session - the
  // server render stays identical for every visitor and cacheable (docs/09
  // §32). The hint only chooses the first destination; a 401 corrects it.
  const authenticatedRef = useRef(false);

  useEffect(() => {
    authenticatedRef.current = readCSRFToken() !== null;

    const sample = () => {
      const root = document.documentElement;
      const scrollable = root.scrollHeight - window.innerHeight;
      // A chapter shorter than the viewport is fully visible: opening it is
      // reading it.
      const percent =
        scrollable <= 0
          ? 100
          : Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
      // Progress only moves forward within a visit - scrolling back up to
      // re-read a paragraph must not rewind the saved position.
      percentRef.current = Math.max(percentRef.current, Math.round(percent * 100) / 100);
    };

    const persist = () => {
      const percent = percentRef.current;
      if (Math.abs(percent - lastSavedRef.current) < MIN_DELTA_PERCENT) return;
      lastSavedRef.current = percent;

      if (!authenticatedRef.current) {
        saveLocalProgress(novelId, chapterId, percent);
        return;
      }
      saveProgress(novelId, { chapter_id: chapterId, progress_percent: percent }).catch(
        (error: unknown) => {
          if (error instanceof ApiError && error.isUnauthorized) {
            // Session ended mid-read: fall back to the guest behaviour.
            authenticatedRef.current = false;
            saveLocalProgress(novelId, chapterId, percent);
            return;
          }
          // Anything else: allow a retry at the next interval.
          lastSavedRef.current = -1;
        },
      );
    };

    const onLeave = () => {
      if (document.visibilityState === "hidden") {
        sample();
        persist();
      }
    };

    // อ่านต่อ from the library carries #resume (library review 2026-08): the
    // reader lands at the position they left, not the chapter top. It runs
    // BEFORE the first persist - otherwise the arrival's own scrollY=0 save
    // would overwrite the very position being resumed.
    const restore = async () => {
      try {
        const saved = authenticatedRef.current
          ? await getNovelProgress(novelId)
          : readLocalProgress(novelId);
        if (saved && saved.chapter_id === chapterId && saved.progress_percent > 3) {
          const root = document.documentElement;
          const target =
            ((root.scrollHeight - window.innerHeight) * saved.progress_percent) / 100;
          window.scrollTo({ top: Math.max(0, target) });
          percentRef.current = saved.progress_percent;
          lastSavedRef.current = saved.progress_percent;
        }
      } catch {
        // Resuming the exact spot is a convenience; the chapter opened.
      }
    };

    let interval: number | undefined;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      sample(); // opening the chapter is itself a position
      persist();
      interval = window.setInterval(() => {
        sample();
        persist();
      }, SAVE_INTERVAL_MS);
    };

    if (window.location.hash === "#resume") {
      void restore().finally(start);
    } else {
      start();
    }

    // Passive: sampling must never delay scrolling (docs/07 §67).
    window.addEventListener("scroll", sample, { passive: true });
    // visibilitychange covers tab switches, navigation, and mobile app
    // backgrounding - the moments a reader actually leaves.
    document.addEventListener("visibilitychange", onLeave);

    return () => {
      cancelled = true;
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("scroll", sample);
      document.removeEventListener("visibilitychange", onLeave);
      sample();
      persist(); // in-app navigation to the next chapter
    };
  }, [chapterId, novelId]);

  return null;
}
