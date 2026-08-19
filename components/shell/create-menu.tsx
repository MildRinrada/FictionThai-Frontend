"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { relativeTime } from "@/lib/format";
import type { DeskResume, DeskWork } from "@/types/desk";

/**
 * + สร้างผลงาน - a button with a menu, not a link to one form.
 *
 * The overwhelmingly common thing a writer comes to do is add a chapter to a
 * fiction they are already writing, and that used to cost four clicks: studio →
 * find the fiction → chapters → new. Starting a NEW fiction - the one thing the
 * button offered - is the rarer act by a wide margin. So the fictions they
 * touched last are in the menu itself, one press away.
 *
 * The primary action stays first and stays a real link: pressing the button and
 * pressing Enter on it must not do different things, and someone who wants a
 * new fiction should not have to read a menu to find it.
 */
export function CreateMenu({
  recent,
  resume,
}: {
  recent: DeskWork[];
  /** Where the writer stopped typing, if they have started anything. */
  resume?: DeskResume;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <div className="flex items-stretch overflow-hidden rounded-md bg-primary text-white">
        <Link
          href="/studio/novels/new"
          className="inline-flex min-h-9 items-center gap-1.5 px-3.5 text-sm font-medium hover:opacity-90"
        >
          <Icon name="plus" size={16} />
          <span className="hidden sm:inline">สร้างผลงาน</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="ตัวเลือกการสร้าง"
          className="flex min-h-9 items-center border-s border-white/25 px-1.5 hover:opacity-90"
        >
          <Icon name="chevron-down" size={15} />
        </button>
      </div>

      {open ? (
        <div
          role="menu"
          className="absolute inset-e-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-popover"
        >
          {/* เขียนต่อจากที่ค้าง, first, because it is the shortest distance
              between opening the site and putting words down - and the writer
              who has a chapter open somewhere almost never wants a new one. */}
          {resume ? (
            <Link
              href={`/studio/novels/${encodeURIComponent(resume.novel_slug)}/chapters/${encodeURIComponent(resume.chapter_slug)}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-start gap-2.5 border-b border-hairline px-3.5 py-2.5 text-sm hover:bg-surface-secondary"
            >
              <Icon name="edit" size={16} className="mt-0.5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block font-medium">เขียนต่อจากที่ค้าง</span>
                <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                  {resume.chapter_label} · {relativeTime(resume.updated_at)}
                </span>
              </span>
            </Link>
          ) : null}

          <Link
            href="/studio/novels/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-surface-secondary"
          >
            <Icon name="book" size={16} className="text-text-muted" />
            เริ่มนิยายเรื่องใหม่
          </Link>

          {recent.length > 0 ? (
            <>
              <p className="mono-label border-t border-hairline px-3.5 pt-2.5 pb-1 text-text-muted">
                เพิ่มตอนในเรื่องที่ค้างอยู่
              </p>
              <ul className="pb-1">
                {recent.map((work) => (
                  <li key={work.slug}>
                    <Link
                      // Straight to the chapter list of that fiction, which is
                      // where "เพิ่มตอน" lives - not to its overview, which
                      // would be one more click for no information.
                      href={`/studio/novels/${encodeURIComponent(work.slug)}/chapters`}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 px-3.5 py-2 text-sm text-text-secondary hover:bg-surface-secondary hover:text-text"
                    >
                      <span className="min-w-0 flex-1 truncate">{work.title}</span>
                      {work.unfinished > 0 ? (
                        <span className="shrink-0 font-mono text-[11px] text-primary tabular-nums">
                          ค้าง {work.unfinished}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-text-muted">
                          {relativeTime(work.updated_at)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
