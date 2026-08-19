"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * โหมดอ่าน - the shell gets out of the way while someone is reading.
 *
 * Scrolling DOWN is reading; the header and the mobile bar slide off and the
 * page is text and nothing else. Scrolling UP is looking for something, and
 * they come straight back - so navigation is never more than a flick away and
 * nobody has to hunt for a hidden control.
 *
 * Only on /read. Everywhere else the header is a tool people are actively
 * using, and a navigation bar that plays hide-and-seek on a browsing page is
 * an annoyance rather than a courtesy.
 *
 * It renders nothing and re-renders nothing: the state lives in one data
 * attribute on <html> and the movement is CSS. A scroll handler that called
 * setState would re-render the whole shell on every frame of every scroll.
 */

/** Ignore jitter - a trackpad's idle wobble is not a decision to scroll. */
const THRESHOLD = 8;
/** Always show the chrome near the top, whatever the last direction was. */
const TOP_ZONE = 64;

export function ChromeAutoHide() {
  const pathname = usePathname();
  const reading = pathname.startsWith("/read/");

  useEffect(() => {
    const root = document.documentElement;
    if (!reading) {
      delete root.dataset.chrome;
      return;
    }

    let last = window.scrollY;
    let frame = 0;

    function apply() {
      frame = 0;
      const current = window.scrollY;
      const moved = current - last;
      if (Math.abs(moved) < THRESHOLD) return;
      last = current;
      if (current <= TOP_ZONE || moved < 0) {
        delete root.dataset.chrome;
      } else {
        root.dataset.chrome = "hidden";
      }
    }

    function onScroll() {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(apply);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      delete root.dataset.chrome;
    };
  }, [reading]);

  return null;
}
