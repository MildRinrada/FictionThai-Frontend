"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { LocalDraftBadge } from "@/features/studio/draft-badge";
import { ApiError } from "@/lib/api";
import { chapterLabel, count, relativeTime } from "@/lib/format";
import { deleteChapter } from "@/lib/novels-client";
import { presentationLabel } from "@/types/fiction";
import type { ChapterSummary } from "@/types/novel";

/**
 * ทำต่อจากที่ค้างไว้ (§13R, rebuilt in §13T).
 *
 * Three complaints shaped this list:
 *
 *   - It was ordered like a table of contents. A backlog is about recency:
 *     the chapter touched last night belongs on top, whatever its number.
 *
 *   - Every row hid its format. On a platform whose whole point is that
 *     chapters can be prose, chat, or headcanon, the writer had to open each
 *     draft to learn which one it was.
 *
 *   - Empty drafts - created, never written - piled up among real work and
 *     looked like junk with no way to throw them out. They now sit in their
 *     own collapsed group with a per-row delete and a "ลบร่างว่างทั้งหมด".
 *
 * Deleting here is scoped HARD to empty drafts: a draft with any content in
 * any representation never gets a delete button on this list. Removing real
 * writing is the chapter manager's job, behind its own confirmation - never a
 * hover-reveal on a dashboard (writer-first: no surprise destruction).
 */

const FORMAT_ICONS: Record<string, IconName> = {
  standard: "book",
  chat: "message",
  headcanon: "users",
};

/** A draft is EMPTY only when no representation holds anything at all. */
function isEmptyDraft(chapter: ChapterSummary): boolean {
  return !chapter.content_ready && chapter.word_count === 0;
}

function FormatPill({ format }: { format: string }) {
  const label = presentationLabel(format);
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-secondary">
      <Icon name={FORMAT_ICONS[format] ?? "book"} size={11} />
      {label}
    </span>
  );
}

export function DraftTasks({
  novelRef,
  base,
  chapterUnit,
  drafts,
}: {
  novelRef: string;
  base: string;
  chapterUnit?: string;
  drafts: ChapterSummary[];
}) {
  const router = useRouter();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [emptyOpen, setEmptyOpen] = useState(false);
  /** Which confirmation is showing: a chapter id, or "all". */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alive = drafts.filter((chapter) => !removed.has(chapter.id));
  // Recency order (§13T): the header says "ทำต่อ", so the list leads with
  // what was touched last, not with the smallest chapter number.
  const byRecency = [...alive].sort(
    (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
  );
  const working = byRecency.filter((chapter) => !isEmptyDraft(chapter));
  const empty = byRecency.filter(isEmptyDraft);

  if (alive.length === 0) return null;

  async function remove(ids: string[]) {
    setBusy(true);
    setError(null);
    try {
      for (const id of ids) {
        const chapter = alive.find((c) => c.id === id);
        if (!chapter) continue;
        await deleteChapter(novelRef, chapter.slug);
      }
      setRemoved((current) => new Set([...current, ...ids]));
      setConfirming(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ลบร่างไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const title = (chapter: ChapterSummary) =>
    chapter.title ?? chapterLabel(chapterUnit, chapter.chapter_number);

  return (
    <section aria-labelledby="draft-tasks-heading" className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2
          id="draft-tasks-heading"
          className="font-serif text-xl font-semibold tracking-tight"
        >
          ทำต่อจากที่ค้างไว้ · {count(alive.length)}
        </h2>
        <Link
          href={`${base}/chapters`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          ดูตอนทั้งหมด
          <Icon name="arrow-right" size={15} />
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-error">
          {error}
        </p>
      ) : null}

      {working.length > 0 ? (
        <ul className="divide-y divide-hairline rounded-lg border border-border bg-surface">
          {working.map((chapter) => (
            <li
              key={chapter.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <span className="w-9 shrink-0 font-mono text-xs text-text-muted tabular-nums">
                {chapter.chapter_number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm">{title(chapter)}</span>
                  {/* What this chapter IS (§13T) - the mixed-format system's
                      whole point, visible without opening the draft. */}
                  <FormatPill format={chapter.active_format} />
                  <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-muted">
                    แบบร่าง
                  </span>
                  <LocalDraftBadge novelRef={novelRef} chapterSlug={chapter.slug} />
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {chapter.word_count > 0
                    ? `${count(chapter.word_count)} คำ`
                    : "มีเนื้อหาแล้ว"}
                  {" · แก้ไข "}
                  {relativeTime(chapter.updated_at)}
                </span>
              </span>
              <Link
                href={`${base}/chapters/${encodeURIComponent(chapter.slug)}`}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90"
              >
                <Icon name="edit" size={15} />
                เขียนต่อ
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {empty.length > 0 ? (
        <div
          className={`rounded-lg border border-border border-dashed ${
            working.length > 0 ? "mt-3" : ""
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setEmptyOpen((value) => !value)}
              aria-expanded={emptyOpen}
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
            >
              <Icon name={emptyOpen ? "chevron-up" : "chevron-down"} size={14} />
              ร่างว่าง · {count(empty.length)} ตอน
              <span className="text-xs text-text-muted">(ยังไม่มีเนื้อหา)</span>
            </button>

            {confirming === "all" ? (
              <span className="ms-auto flex items-center gap-2 text-xs">
                <span className="text-text-secondary">
                  ลบร่างว่างทั้ง {count(empty.length)} ตอน?
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(empty.map((chapter) => chapter.id))}
                  className="inline-flex min-h-8 items-center rounded-md bg-error px-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "กำลังลบ…" : "ลบ"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                  className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-text-secondary hover:text-text disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming("all")}
                className="ms-auto inline-flex items-center gap-1 text-xs text-text-muted hover:text-error"
              >
                <Icon name="trash" size={13} />
                ลบร่างว่างทั้งหมด
              </button>
            )}
          </div>

          {emptyOpen ? (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {empty.map((chapter) => (
                <li
                  key={chapter.id}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
                >
                  <span className="w-9 shrink-0 font-mono text-xs text-text-muted tabular-nums">
                    {chapter.chapter_number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-secondary">
                      {title(chapter)}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      สร้าง {relativeTime(chapter.created_at)}
                    </span>
                  </span>

                  {confirming === chapter.id ? (
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      <span className="text-text-secondary">ลบร่างว่างนี้?</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove([chapter.id])}
                        className="inline-flex min-h-8 items-center rounded-md bg-error px-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? "กำลังลบ…" : "ลบ"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirming(null)}
                        className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-text-secondary hover:text-text disabled:opacity-50"
                      >
                        ยกเลิก
                      </button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Link
                        href={`${base}/chapters/${encodeURIComponent(chapter.slug)}`}
                        className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
                      >
                        เขียนต่อ
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirming(chapter.id)}
                        aria-label={`ลบ ${title(chapter)}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-text-muted opacity-0 transition-opacity hover:bg-error/10 hover:text-error focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
