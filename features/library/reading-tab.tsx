"use client";

import Link from "next/link";
import { useState } from "react";

import { Cover } from "@/components/fiction/cover";
import { NovelCoverCard } from "@/components/fiction/novel-card";
import { Icon } from "@/components/ui/icon";
import { count, relativeTime } from "@/lib/format";
import {
  deleteProgress,
  markFinished,
  saveProgress,
} from "@/lib/library-client";
import { addToShelf } from "@/lib/shelves-client";
import type { ContinueReadingEntry } from "@/types/library";
import type { Novel } from "@/types/novel";
import type { Shelf } from "@/types/shelf";

import { EmptyState, NovelFacts, NovelTitleLink, novelPath } from "@/features/library/shared";

/**
 * แท็บ "กำลังอ่าน" (library redesign 2026-08, section C) - the tab people
 * open most, so it works the hardest:
 *
 *   - One horizontal card per fiction: cover, the stopped-at chapter, a REAL
 *     progress bar over the whole story, "เหลืออีก N ตอน", and the badge
 *     that matters most - chapters published since the reader left.
 *   - อ่านต่อ lands at the saved position (#resume), not the chapter top.
 *   - Read-through fictions leave this list by themselves: a completed story
 *     offers "ปิดเล่ม" into อ่านจบแล้ว; an ongoing one waits under
 *     รอตอนใหม่. Stalled ones (30+ days) gather under ค้างนานแล้ว with a
 *     one-press เก็บกวาด.
 *   - Removal is an undo toast, never a dialog.
 */

const STALE_DAYS = 30;

type Group = "done" | "waiting" | "stale" | "active";

function groupOf(entry: ContinueReadingEntry, now: number): Group {
  if (entry.chapters_left === 0 && entry.total_chapters > 0) {
    return entry.novel.status === "completed" ? "done" : "waiting";
  }
  const ageDays = (now - new Date(entry.last_read_at).getTime()) / 86_400_000;
  return ageDays > STALE_DAYS ? "stale" : "active";
}

/** Whole-story progress: finished chapters plus the current chapter's part. */
function storyPercent(entry: ContinueReadingEntry): number {
  if (entry.total_chapters === 0) return 0;
  const behind = Math.max(
    0,
    entry.total_chapters - entry.chapters_left - 1,
  );
  const within = entry.progress_percent / 100;
  return Math.min(100, Math.round(((behind + within) / entry.total_chapters) * 100));
}

export function ReadingTab({
  initial,
  shelves,
  suggestions,
  onCountChange,
  notify,
}: {
  initial: ContinueReadingEntry[];
  shelves: Shelf[];
  suggestions: Novel[];
  /** Tells the header's stat row when entries leave this tab. */
  onCountChange: (delta: number) => void;
  /** The page-level undo toast. */
  notify: (message: string, undo?: () => void) => void;
}) {
  const [entries, setEntries] = useState(initial);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Grouping compares against ONE opening-time clock: stable per mount, so
  // the compiler's purity rule and the group boundaries both hold still.
  const [now] = useState(() => Date.now());

  function drop(ids: string[], message: string) {
    const removed = entries.filter((entry) => ids.includes(entry.novel.id));
    setEntries((current) => current.filter((entry) => !ids.includes(entry.novel.id)));
    onCountChange(-removed.length);
    for (const entry of removed) void deleteProgress(entry.novel.id);
    notify(message, () => {
      setEntries((current) => [...removed, ...current]);
      onCountChange(removed.length);
      for (const entry of removed) {
        if (entry.chapter) {
          void saveProgress(entry.novel.id, {
            chapter_id: entry.chapter.id,
            progress_percent: entry.progress_percent,
          });
        }
      }
    });
  }

  function finish(entry: ContinueReadingEntry) {
    setEntries((current) => current.filter((row) => row.novel.id !== entry.novel.id));
    onCountChange(-1);
    setMenuFor(null);
    void markFinished(entry.novel.id).then(() => deleteProgress(entry.novel.id));
    notify(`ปิดเล่ม "${entry.novel.title}" แล้ว - ไปอยู่ในอ่านจบแล้ว`);
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="book"
        title="ยังไม่มีเรื่องที่อ่านค้างไว้"
        body="เปิดอ่านเรื่องไหนก็ได้ ระบบจะจำตำแหน่งให้เอง แล้วกลับมาอ่านต่อจากตรงนั้นได้ที่นี่"
      >
        {suggestions.length > 0 ? (
          <div className="mt-4 w-full">
            <p className="mono-label mb-3 text-start">ลองเริ่มจากเรื่องเหล่านี้</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {suggestions.slice(0, 4).map((novel) => (
                <NovelCoverCard key={novel.id} novel={novel} />
              ))}
            </div>
          </div>
        ) : null}
      </EmptyState>
    );
  }

  const groups: { key: Group; title: string; hint?: string }[] = [
    { key: "active", title: "อ่านค้างไว้" },
    { key: "waiting", title: "รอตอนใหม่", hint: "อ่านครบทุกตอนแล้ว - เรื่องยังเขียนต่อ" },
    { key: "done", title: "อ่านครบแล้ว - ปิดเล่มไหม?", hint: "เรื่องจบแล้วและคุณอ่านถึงตอนสุดท้าย" },
    { key: "stale", title: `ค้างนานแล้ว (เกิน ${STALE_DAYS} วัน)` },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ key, title, hint }) => {
        const rows = entries.filter((entry) => groupOf(entry, now) === key);
        if (rows.length === 0) return null;
        return (
          <section key={key} aria-label={title}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-sm font-medium">{title}</h2>
              <span className="text-xs text-text-muted">{count(rows.length)} เรื่อง</span>
              {hint ? <span className="text-xs text-text-muted">· {hint}</span> : null}
              {key === "stale" ? (
                <button
                  type="button"
                  onClick={() =>
                    drop(
                      rows.map((row) => row.novel.id),
                      `เก็บกวาด ${count(rows.length)} เรื่องแล้ว`,
                    )
                  }
                  className="ms-auto inline-flex min-h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-error hover:text-error"
                >
                  <Icon name="trash" size={12} />
                  เก็บกวาดทั้งกลุ่ม
                </button>
              ) : null}
            </div>
            <ol className="mt-2 flex flex-col gap-2">
              {rows.map((entry) => (
                <li key={entry.novel.id}>
                  <ReadingCard
                    entry={entry}
                    shelves={shelves}
                    menuOpen={menuFor === entry.novel.id}
                    onMenu={() =>
                      setMenuFor((current) =>
                        current === entry.novel.id ? null : entry.novel.id,
                      )
                    }
                    onFinish={() => finish(entry)}
                    onRemove={() =>
                      drop([entry.novel.id], `เอา "${entry.novel.title}" ออกแล้ว`)
                    }
                    onShelved={(shelf) => {
                      setMenuFor(null);
                      notify(`เพิ่มลงชั้น "${shelf.name}" แล้ว`);
                    }}
                  />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function ReadingCard({
  entry,
  shelves,
  menuOpen,
  onMenu,
  onFinish,
  onRemove,
  onShelved,
}: {
  entry: ContinueReadingEntry;
  shelves: Shelf[];
  menuOpen: boolean;
  onMenu: () => void;
  onFinish: () => void;
  onRemove: () => void;
  onShelved: (shelf: Shelf) => void;
}) {
  const { novel, chapter } = entry;
  const percent = storyPercent(entry);
  const resumeHref = chapter
    ? `/read/${encodeURIComponent(novel.slug)}/${encodeURIComponent(chapter.slug)}#resume`
    : novelPath(novel);

  return (
    <div className="flex gap-3.5 rounded-lg border border-border bg-surface p-3.5">
      <Link href={novelPath(novel)} className="w-14 shrink-0 sm:w-16">
        <Cover url={novel.cover_url} title={novel.title} className="rounded-md" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <NovelTitleLink novel={novel} />
            <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">
              {novel.author.display_name || novel.author.username}
            </p>
          </div>
          {entry.new_since_read > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary">
              <Icon name="sparkle" size={11} />
              มี {count(entry.new_since_read)} ตอนใหม่หลังจากที่คุณอ่านค้างไว้
            </span>
          ) : null}
        </div>

        <p className="mt-1.5 text-xs text-text-secondary">
          {chapter
            ? `อ่านค้างที่: ตอนที่ ${count(chapter.chapter_number)}${chapter.title ? ` · ${chapter.title}` : ""}`
            : "ตอนที่ค้างไว้ถูกถอนออกไปแล้ว - เริ่มจากหน้าเรื่องได้"}
          <span className="ms-2 text-text-muted">{relativeTime(entry.last_read_at)}</span>
        </p>

        {entry.total_chapters > 0 ? (
          <div className="mt-2 flex items-center gap-2.5">
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`อ่านแล้ว ${percent}%`}
              className="h-1.5 max-w-64 flex-1 overflow-hidden rounded-full bg-surface-secondary"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-[11px] text-text-muted tabular-nums">
              {entry.chapters_left > 0
                ? `เหลืออีก ${count(entry.chapters_left)} ตอน`
                : "อ่านครบทุกตอนแล้ว"}
            </span>
          </div>
        ) : null}

        <div className="mt-2 flex items-center gap-1.5">
          <NovelFacts novel={novel} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <span className="relative">
          <button
            type="button"
            onClick={onMenu}
            aria-label={`เมนูของ ${novel.title}`}
            aria-expanded={menuOpen}
            className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
          >
            <Icon name="more-horizontal" size={16} />
          </button>
          {menuOpen ? (
            <span className="absolute top-full z-20 mt-1 flex w-52 flex-col rounded-md border border-border bg-surface p-1 text-[13px] shadow-lg inset-e-0">
              <button
                type="button"
                onClick={onFinish}
                className="rounded px-2.5 py-1.5 text-start hover:bg-surface-secondary"
              >
                ทำเครื่องหมายว่าอ่านจบ
              </button>
              {shelves.length > 0 ? (
                <span className="mt-1 border-t border-hairline pt-1">
                  <span className="block px-2.5 py-1 text-[11px] text-text-muted">
                    ย้ายไปชั้น…
                  </span>
                  {shelves.map((shelf) => (
                    <button
                      key={shelf.id}
                      type="button"
                      onClick={() => {
                        void addToShelf(shelf.id, novel.id);
                        onShelved(shelf);
                      }}
                      className="block w-full rounded px-2.5 py-1.5 text-start hover:bg-surface-secondary"
                    >
                      {shelf.name}
                    </button>
                  ))}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onRemove}
                className="mt-1 rounded border-t border-hairline px-2.5 py-1.5 pt-2 text-start text-error hover:bg-error/5"
              >
                เอาออกจากกำลังอ่าน
              </button>
            </span>
          ) : null}
        </span>

        <Link
          href={resumeHref}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90"
        >
          อ่านต่อ
          <Icon name="arrow-right" size={14} />
        </Link>
      </div>
    </div>
  );
}
