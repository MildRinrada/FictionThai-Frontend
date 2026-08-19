"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Cover } from "@/components/fiction/cover";
import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import { getFinished, markFinished, unmarkFinished } from "@/lib/library-client";
import { PresentationFormat, presentationLabel } from "@/types/fiction";
import type { ApiMeta } from "@/types/api";
import type { FinishedEntry } from "@/types/library";

import {
  EmptyState,
  NovelFacts,
  NovelTitleLink,
  Pager,
  novelPath,
  totalPagesOf,
} from "@/features/library/shared";

/**
 * แท็บ "อ่านจบแล้ว" (library redesign 2026-08, section E): the reader's own
 * record, grouped by month, with a PRIVATE star and note per fiction and the
 * small year line every reader quietly wants.
 */

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function monthKey(iso: string): string {
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

export function FinishedTab({
  initial,
  initialMeta,
  notify,
  onCountChange,
}: {
  initial: FinishedEntry[];
  initialMeta: ApiMeta | null;
  notify: (message: string, undo?: () => void) => void;
  onCountChange: (delta: number) => void;
}) {
  const [entries, setEntries] = useState(initial);
  const [meta, setMeta] = useState(initialMeta);
  const [page, setPage] = useState(1);

  async function goPage(next: number) {
    try {
      const result = await getFinished({ page: next });
      setEntries(result.items);
      setMeta(result.meta);
      setPage(next);
    } catch {
      notify("โหลดหน้าไม่สำเร็จ ลองอีกครั้ง");
    }
  }

  function saveMark(entry: FinishedEntry, changes: { stars?: number | null; note?: string | null }) {
    setEntries((current) =>
      current.map((row) =>
        row.novel.id === entry.novel.id ? { ...row, ...changes } : row,
      ),
    );
    void markFinished(entry.novel.id, {
      stars: changes.stars !== undefined ? changes.stars : entry.stars,
      note: changes.note !== undefined ? changes.note : entry.note,
    });
  }

  function remove(entry: FinishedEntry) {
    setEntries((current) => current.filter((row) => row.novel.id !== entry.novel.id));
    onCountChange(-1);
    void unmarkFinished(entry.novel.id);
    notify(`เอา "${entry.novel.title}" ออกจากอ่านจบแล้ว`, () => {
      setEntries((current) => [entry, ...current]);
      onCountChange(1);
      void markFinished(entry.novel.id, { stars: entry.stars, note: entry.note });
    });
  }

  // The year line (section E): what this year of reading amounted to.
  const yearSummary = useMemo(() => {
    const year = new Date().getFullYear();
    const inYear = entries.filter(
      (entry) => new Date(entry.finished_at).getFullYear() === year,
    );
    if (inYear.length === 0) return null;
    const formats = new Map<string, number>();
    for (const entry of inYear) {
      const format = entry.novel.has_mixed_formats
        ? "ผสมรูปแบบ"
        : (presentationLabel(
            entry.novel.presentation_format ?? PresentationFormat.Standard,
          ) ?? "ร้อยแก้ว");
      formats.set(format, (formats.get(format) ?? 0) + 1);
    }
    const top = [...formats.entries()].sort((a, b) => b[1] - a[1])[0];
    const chapters = inYear.reduce((sum, entry) => sum + entry.novel.chapter_count, 0);
    return `ปีนี้อ่านจบ ${count(inYear.length)} เรื่อง · ${count(chapters)} ตอน · อ่าน${top[0]}บ่อยสุด`;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="ยังไม่มีเรื่องที่ทำเครื่องหมายว่าอ่านจบ"
        body='กด "ทำเครื่องหมายว่าอ่านจบ" ได้จากเมนูของเรื่องในแท็บกำลังอ่าน - เก็บเป็นสถิติส่วนตัว พร้อมดาวและโน้ตที่เห็นคนเดียว'
      />
    );
  }

  const groups = new Map<string, FinishedEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.finished_at);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return (
    <div>
      {yearSummary ? (
        <p className="mb-4 rounded-lg border border-primary-200 bg-primary-50/60 px-3.5 py-2.5 text-sm text-primary">
          {yearSummary}
        </p>
      ) : null}

      <div className="flex flex-col gap-5">
        {[...groups.entries()].map(([month, rows]) => (
          <section key={month} aria-label={month}>
            <h2 className="text-sm font-medium text-text-secondary">{month}</h2>
            <ol className="mt-2 flex flex-col gap-2">
              {rows.map((entry) => (
                <li key={entry.novel.id}>
                  <FinishedCard
                    entry={entry}
                    onStars={(stars) => saveMark(entry, { stars })}
                    onNote={(note) => saveMark(entry, { note: note || null })}
                    onRemove={() => remove(entry)}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <Pager
        page={page}
        totalPages={totalPagesOf(meta)}
        onPage={(next) => void goPage(next)}
      />
    </div>
  );
}

function FinishedCard({
  entry,
  onStars,
  onNote,
  onRemove,
}: {
  entry: FinishedEntry;
  onStars: (stars: number | null) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(entry.note ?? "");
  const [noting, setNoting] = useState(false);

  return (
    <div className="flex gap-3.5 rounded-lg border border-border bg-surface p-3.5">
      <Link href={novelPath(entry.novel)} className="w-12 shrink-0">
        <Cover url={entry.novel.cover_url} title={entry.novel.title} className="rounded-md" />
      </Link>
      <div className="min-w-0 flex-1">
        <NovelTitleLink novel={entry.novel} />
        <div className="mt-1">
          <NovelFacts novel={entry.novel} />
        </div>

        {/* The PRIVATE star row - seen by exactly one person. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-0.5" role="group" aria-label="ดาวส่วนตัว">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={`ให้ ${star} ดาว`}
                aria-pressed={(entry.stars ?? 0) >= star}
                onClick={() => onStars(entry.stars === star ? null : star)}
                className={
                  (entry.stars ?? 0) >= star
                    ? "text-warning"
                    : "text-border hover:text-warning/60"
                }
              >
                <Icon name="sparkle" size={15} />
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={() => setNoting((open) => !open)}
            className="text-xs text-text-secondary hover:text-text"
          >
            {entry.note ? "แก้โน้ตส่วนตัว" : "+ โน้ตส่วนตัว (เห็นคนเดียว)"}
          </button>
        </div>

        {noting ? (
          <textarea
            autoFocus
            rows={1}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => {
              setNoting(false);
              if (note !== (entry.note ?? "")) onNote(note.trim());
            }}
            placeholder="เช่น อ่านจบตอนตีสาม ร้องหนักมาก"
            aria-label={`โน้ตส่วนตัวของ ${entry.novel.title}`}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm field-sizing-content focus:border-primary focus:outline-none"
          />
        ) : entry.note ? (
          <p className="mt-1.5 text-xs text-text-secondary italic">“{entry.note}”</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`เอา ${entry.novel.title} ออกจากอ่านจบแล้ว`}
          title="เอาออกจากอ่านจบแล้ว"
          className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-error"
        >
          <Icon name="close" size={14} />
        </button>
        <Link
          href={novelPath(entry.novel)}
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
        >
          <Icon name="undo" size={12} />
          อ่านซ้ำ
        </Link>
      </div>
    </div>
  );
}
