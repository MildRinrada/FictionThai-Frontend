"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { count } from "@/lib/format";
import type { ApiMeta } from "@/types/api";
import type {
  ContinueReadingEntry,
  FinishedEntry,
  FollowedAuthor,
  HistoryEntry,
  HistorySettings,
  LibraryEntry,
} from "@/types/library";
import type { Novel } from "@/types/novel";
import type { Shelf } from "@/types/shelf";

import { FinishedTab } from "@/features/library/finished-tab";
import { FollowingTab } from "@/features/library/following-tab";
import { HistoryTab } from "@/features/library/history-tab";
import { ReadingTab } from "@/features/library/reading-tab";
import { ShelvesTab } from "@/features/library/shelves-tab";

/**
 * ชั้นหนังสือของฉัน (library redesign 2026-08): the page as a reader's TOOL.
 *
 * One compact header whose numbers are themselves the navigation, one sticky
 * tab strip whose state lives in the URL (?tab=) so a place here can be
 * returned to and sent to someone, and one undo toast shared by every
 * destructive move - removal never asks first, it offers เลิกทำ after.
 */

export type LibraryTabKey = "reading" | "shelves" | "finished" | "following" | "history";

const TABS: { key: LibraryTabKey; label: string }[] = [
  { key: "reading", label: "กำลังอ่าน" },
  { key: "shelves", label: "ชั้นของฉัน" },
  { key: "finished", label: "อ่านจบแล้ว" },
  { key: "following", label: "นักเขียนที่ติดตาม" },
  { key: "history", label: "ประวัติการอ่าน" },
];

export interface LibraryData {
  reading: ContinueReadingEntry[];
  readingMeta: ApiMeta | null;
  bookmarks: LibraryEntry[];
  bookmarksMeta: ApiMeta | null;
  shelves: Shelf[];
  finished: FinishedEntry[];
  finishedMeta: ApiMeta | null;
  following: FollowedAuthor[];
  followingMeta: ApiMeta | null;
  history: HistoryEntry[];
  historyMeta: ApiMeta | null;
  historySettings: HistorySettings | null;
  suggestions: Novel[];
  username: string;
}

export function LibraryView({
  data,
  initialTab,
}: {
  data: LibraryData;
  initialTab: LibraryTabKey;
}) {
  const searchParams = useSearchParams();
  // DERIVED from the URL, never mirrored into state: ?tab= is the single
  // source of truth, so back/forward walk the tabs like the pages they are.
  const rawTab = searchParams.get("tab");
  const tab: LibraryTabKey =
    TABS.find((candidate) => candidate.key === rawTab)?.key ?? initialTab;

  // The header's live numbers: tabs adjust them as things move between them.
  const [counts, setCounts] = useState({
    reading: data.readingMeta?.total ?? data.reading.length,
    saved: data.bookmarksMeta?.total ?? data.bookmarks.length,
    finished: data.finishedMeta?.total ?? data.finished.length,
    following: data.followingMeta?.total ?? data.following.length,
  });
  const bump = useCallback(
    (key: keyof typeof counts) => (delta: number) =>
      setCounts((current) => ({
        ...current,
        [key]: Math.max(0, current[key] + delta),
      })),
    [],
  );

  // One toast for the whole page: "ทำแล้ว · เลิกทำ", 6 seconds.
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const notify = useCallback((message: string, undo?: () => void) => {
    setToast({ message, undo });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  // The tab lives in the URL so the place is addressable - updated SHALLOWLY
  // (library/profile review follow-up 2026-08): a tab press must never
  // refresh the page, and pushState keeps back/forward walking the tabs.
  // useSearchParams tracks shallow updates, so `tab` re-derives on its own.
  function open(next: LibraryTabKey) {
    window.history.pushState(
      null,
      "",
      next === "reading" ? "/library" : `/library?tab=${next}`,
    );
  }

  const stats: { key: LibraryTabKey; label: string }[] = [
    { key: "reading", label: `กำลังอ่าน ${count(counts.reading)}` },
    { key: "shelves", label: `บันทึกไว้ ${count(counts.saved)}` },
    { key: "finished", label: `อ่านจบแล้ว ${count(counts.finished)}` },
    { key: "following", label: `ติดตาม ${count(counts.following)} นักเขียน` },
  ];

  return (
    <div>
      {/* A) The compact header: the name the navbar uses, and numbers that
          ARE the navigation. */}
      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          ชั้นหนังสือของฉัน
        </h1>
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-text-secondary">
          {stats.map((stat, index) => (
            <span key={stat.key} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden>·</span> : null}
              <button
                type="button"
                onClick={() => open(stat.key)}
                className="rounded px-1 py-0.5 tabular-nums hover:bg-surface-secondary hover:text-text"
              >
                {stat.label}
              </button>
            </span>
          ))}
        </p>
      </header>

      {/* B) The sticky tab strip; horizontal scroll on a narrow screen. */}
      <nav
        aria-label="ส่วนของชั้นหนังสือ"
        className="scrollbar-none sticky top-15 z-20 -mx-1 mt-4 flex gap-1 overflow-x-auto border-b border-hairline bg-background/95 px-1 backdrop-blur-sm"
      >
        {TABS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            aria-current={tab === candidate.key ? "page" : undefined}
            onClick={() => open(candidate.key)}
            className={`inline-flex min-h-10 shrink-0 items-center border-b-2 px-3 text-sm ${
              tab === candidate.key
                ? "border-primary font-medium text-primary"
                : "border-transparent text-text-secondary hover:text-text"
            }`}
          >
            {candidate.label}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "reading" ? (
          <ReadingTab
            initial={data.reading}
            shelves={data.shelves}
            suggestions={data.suggestions}
            onCountChange={bump("reading")}
            notify={notify}
          />
        ) : tab === "shelves" ? (
          <ShelvesTab
            bookmarks={data.bookmarks}
            initialShelves={data.shelves}
            reading={data.reading}
            username={data.username}
            notify={notify}
          />
        ) : tab === "finished" ? (
          <FinishedTab
            initial={data.finished}
            initialMeta={data.finishedMeta}
            notify={notify}
            onCountChange={bump("finished")}
          />
        ) : tab === "following" ? (
          <FollowingTab
            initial={data.following}
            notify={notify}
            onCountChange={bump("following")}
          />
        ) : (
          <HistoryTab
            initial={data.history}
            initialMeta={data.historyMeta}
            settings={data.historySettings}
            notify={notify}
          />
        )}
      </div>

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <p className="flex items-center gap-3 rounded-full bg-text px-4 py-2 text-sm text-background shadow-lg">
            {toast.message}
            {toast.undo ? (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
                className="font-medium underline underline-offset-2"
              >
                เลิกทำ
              </button>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
