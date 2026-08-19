"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { signalAchievement } from "@/lib/achievements-client";
import { CLIENT_SIGNALS, type SignalResult } from "@/types/achievement";

/**
 * The four client-side easter eggs
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 3).
 *
 * DevTools, a poke at /admin, a disabled button pressed twenty times, and
 * Ctrl+S on an editor that saves itself. All cosmetic - the server keeps the
 * allowlist, so nothing here can unlock anything that implies real work.
 *
 * **It never interrupts writing.** An unlock is held until the writer is not
 * mid-sentence: the strip appears on a save, on leaving the editor, or - when
 * they were nowhere near the editor - immediately. No modal, ever, and it can
 * be dismissed.
 *
 * DevTools detection is the cheap kind on purpose: the outer/inner size gap,
 * sampled a few times, and only while the page is visible. It must never fire
 * on an ordinary resize, so it wants a large gap AND the window not to have
 * just changed size.
 */

const DEVTOOLS_GAP = 170;
const POKE_PATHS = ["/admin", "/wp-admin", "/.env", "/wp-login.php", "/phpmyadmin"];

export function EggWatcher() {
  const [strip, setStrip] = useState<SignalResult["unlocked"] | null>(null);
  const pending = useRef<SignalResult["unlocked"] | null>(null);
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    /** Shows an unlock now, or holds it until the writer stops typing. */
    function announce(result: SignalResult | null) {
      if (!result?.unlocked) return;
      const editing = Boolean(
        document.querySelector('[contenteditable="true"]') ??
          document.querySelector("[data-editor-open]"),
      );
      if (editing) {
        pending.current = result.unlocked;
        return;
      }
      setStrip(result.unlocked);
    }

    async function report(key: string) {
      if (fired.current.has(key)) return;
      fired.current.add(key);
      announce(await signalAchievement(key));
    }

    // 1. A poke at an admin path. The router never had such a route, so this
    //    is the 404 the visitor landed on.
    const path = window.location.pathname.toLowerCase();
    if (POKE_PATHS.some((probe) => path === probe || path.startsWith(`${probe}/`))) {
      void report(CLIENT_SIGNALS.adminPath);
    }

    // 2. DevTools. Sampled, not polled tightly, and never during a resize.
    let lastResize = 0;
    const onResize = () => {
      lastResize = Date.now();
    };
    window.addEventListener("resize", onResize);
    const devtools = window.setInterval(() => {
      if (document.hidden || Date.now() - lastResize < 1200) return;
      const wide = window.outerWidth - window.innerWidth > DEVTOOLS_GAP;
      const tall = window.outerHeight - window.innerHeight > DEVTOOLS_GAP;
      if (wide || tall) void report(CLIENT_SIGNALS.devtools);
    }, 2000);

    // 3. Ctrl+S where the editor already saves itself.
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        if (document.querySelector('[contenteditable="true"]')) {
          void report(CLIENT_SIGNALS.ctrlS);
        }
      }
    };
    window.addEventListener("keydown", onKey);

    // 4. A disabled button, pressed and pressed. The click never reaches a
    //    disabled element, so this listens for the press on the way down.
    let disabledPresses = 0;
    const onPointerDown = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest(
        "button, input, [role='button']",
      );
      if (target instanceof HTMLElement && isDisabled(target)) {
        disabledPresses += 1;
        if (disabledPresses >= 20) void report(CLIENT_SIGNALS.disabledButton);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);

    // A held unlock surfaces when the writer leaves the editor.
    const flush = window.setInterval(() => {
      if (!pending.current) return;
      if (document.querySelector('[contenteditable="true"]')) return;
      setStrip(pending.current);
      pending.current = null;
    }, 3000);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.clearInterval(devtools);
      window.clearInterval(flush);
    };
  }, []);

  if (!strip) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 end-4 z-50 max-w-xs rounded-xl border border-border bg-surface p-3.5 shadow-lg"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon name="sparkle" size={15} className="shrink-0 text-primary" />
        {strip.title}
      </p>
      {strip.message ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
          {strip.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setStrip(null)}
        className="mt-2 text-xs text-primary hover:underline"
      >
        ปิด
      </button>
    </div>
  );
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
}
