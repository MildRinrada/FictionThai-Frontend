import Link from "next/link";

import { Cover } from "@/components/fiction/cover";
import { NovelCoverCard } from "@/components/fiction/novel-card";
import { Icon } from "@/components/ui/icon";
import type { ApiMeta } from "@/types/api";
import type { Novel } from "@/types/novel";
import type { ReactNode } from "react";

/**
 * The ผลงาน panel: the work itself, how it is ordered, and - for the owner -
 * what is not published yet.
 *
 * Three things this fixes.
 *
 * **The owner's own page was lying by omission.** A writer whose fictions are
 * all still drafts saw an empty profile with nothing to explain it, while the
 * studio knew perfectly well the work existed and what was blocking it. The
 * owner now sees their unpublished work here, marked, with the way to finish
 * it. A visitor's page is unchanged - the API decides what a stranger may see,
 * this only asks with the session.
 *
 * **Sorting.** ล่าสุด / ยอดนิยม / จบแล้ว, in the URL, so a writer can hand
 * someone a link to their finished work rather than telling them what to click.
 *
 * **Real page numbers.** Not infinite scroll: an author has to be able to link
 * to page 3 (docs/DESIGN-DIRECTION.md's pagination note, and the handoff's
 * `‹ 1 2 3 … 13 ›`).
 */

export type WorksSort = "updated" | "popular" | "completed" | "ongoing";

const SORTS: ReadonlyArray<{ value: WorksSort; label: string }> = [
  { value: "updated", label: "ล่าสุด" },
  { value: "popular", label: "ยอดนิยม" },
  { value: "completed", label: "จบแล้ว" },
  // The old กำลังเขียนอยู่ tab, as the filter it always was (profile review
  // 2026-08 section D): one list, sliced - not two tabs counting one work
  // twice.
  { value: "ongoing", label: "กำลังเขียน" },
];

export function worksSortOf(raw: string | undefined): WorksSort {
  return raw === "popular" || raw === "completed" || raw === "ongoing"
    ? raw
    : "updated";
}

export interface WorksPanelProps {
  works: Novel[];
  meta?: ApiMeta;
  page: number;
  sort: WorksSort;
  /** Builds a URL for this panel's own query parameters. */
  hrefFor: (query: { page?: number; sort?: WorksSort }) => string;
  /** The owner's view: unpublished work is included and marked. */
  isOwner: boolean;
  fallback: ReactNode;
}

export function WorksPanel({
  works,
  meta,
  page,
  sort,
  hrefFor,
  isOwner,
  fallback,
}: WorksPanelProps) {
  const unpublished = isOwner
    ? works.filter((novel) => novel.visibility === "private" || novel.status === "draft")
    : [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-1.5" aria-label="เรียงผลงาน">
          {SORTS.map((option) => {
            const active = option.value === sort;
            return (
              <li key={option.value}>
                <Link
                  href={hrefFor({ sort: option.value, page: 1 })}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm ${
                    active
                      ? "border-primary bg-primary-50 font-medium text-primary"
                      : "border-border text-text-secondary hover:border-primary-200 hover:text-text"
                  }`}
                >
                  {option.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {/* Only when there is more than this page shows - "แสดง 1 จาก 1"
            says nothing (profile review section H). */}
        {meta && meta.total > works.length ? (
          <p className="text-xs text-text-muted tabular-nums">
            แสดง {works.length} จาก {meta.total} เรื่อง
          </p>
        ) : null}
      </div>

      {isOwner && unpublished.length > 0 ? (
        <p className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3.5 py-3 text-[13px]">
          <Icon name="alert" size={15} className="shrink-0 text-text-muted" />
          <span>
            มี {unpublished.length} เรื่องที่ยังไม่เผยแพร่ - คนอื่นยังมองไม่เห็น
          </span>
          <Link href="/studio" className="text-primary hover:underline">
            ไปหน้าสตูดิโอเพื่อเผยแพร่
          </Link>
        </p>
      ) : null}

      {works.length === 0 ? (
        fallback
      ) : works.length === 1 ? (
        // One story floating in a grid cell reads as a shelf that failed to
        // load (profile review section C) - one story earns the whole row.
        <SingleWork novel={works[0]} isOwner={isOwner} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {works.map((novel) => (
            <li key={novel.id} className="relative">
              {/* The card drops the author line here (section H): every card
                  on this page is by the person whose page it is. */}
              <NovelCoverCard novel={novel} hideAuthor />
              {isOwner && (novel.visibility === "private" || novel.status === "draft") ? (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-text-secondary">
                  <Icon name="lock" size={11} />
                  {novel.status === "draft" ? "ฉบับร่าง" : "ส่วนตัว"}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} meta={meta} hrefFor={hrefFor} />
    </div>
  );
}

const SINGLE_STATUS: Record<string, string> = {
  ongoing: "กำลังเขียน",
  completed: "จบแล้ว",
  hiatus: "พักไว้",
};

/**
 * The one-story layout (profile review section C): a wide card that spends
 * the space on the blurb, the extent, the status, and the one button a new
 * reader wants - not a lone cover adrift in a grid.
 */
function SingleWork({ novel, isOwner }: { novel: Novel; isOwner: boolean }) {
  const unpublished = novel.visibility === "private" || novel.status === "draft";
  return (
    <section className="flex gap-5 rounded-xl border border-border bg-surface p-5">
      <Link href={`/novel/${encodeURIComponent(novel.slug)}`} className="w-28 shrink-0 sm:w-36">
        <Cover url={novel.cover_url} title={novel.title} className="rounded-lg" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/novel/${encodeURIComponent(novel.slug)}`}
          className="line-clamp-2 font-serif text-xl font-semibold tracking-tight hover:text-primary"
        >
          {novel.title}
        </Link>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
          <span>{SINGLE_STATUS[novel.status] ?? novel.status}</span>
          <span aria-hidden>·</span>
          <span>
            {novel.uses_chapter_navigation ? `${novel.chapter_count} ตอน` : "จบในตอน"}
          </span>
          {isOwner && unpublished ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]">
              <Icon name="lock" size={10} />
              {novel.status === "draft" ? "ฉบับร่าง" : "ส่วนตัว"}
            </span>
          ) : null}
        </p>
        {novel.tagline || novel.description ? (
          <p className="mt-3 line-clamp-3 font-serif text-sm leading-relaxed text-text-secondary">
            {novel.tagline ?? novel.description}
          </p>
        ) : null}
        <Link
          href={`/novel/${encodeURIComponent(novel.slug)}`}
          className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
        >
          อ่านตอนแรก
          <Icon name="arrow-right" size={14} />
        </Link>
      </div>
    </section>
  );
}

/**
 * Numbered pages with the ends always reachable, and the current one stated in
 * words for a screen reader rather than by colour alone.
 */
export function Pager({
  page,
  meta,
  hrefFor,
}: {
  page: number;
  meta?: ApiMeta;
  hrefFor: (query: { page?: number }) => string;
}) {
  const perPage = meta?.per_page ?? 12;
  const total = meta?.total ?? 0;
  const last = Math.max(1, Math.ceil(total / perPage));
  if (last <= 1) return null;

  const numbers = pageWindow(page, last);

  return (
    <nav aria-label="หน้าของผลงาน" className="mt-8 flex flex-wrap items-center gap-1.5">
      {page > 1 ? (
        <Link href={hrefFor({ page: page - 1 })} className={pageClass(false)}>
          ‹<span className="sr-only">หน้าก่อนหน้า</span>
        </Link>
      ) : null}

      {numbers.map((number, index) =>
        number === null ? (
          <span key={`gap-${index}`} className="px-1 text-text-muted">
            …
          </span>
        ) : (
          <Link
            key={number}
            href={hrefFor({ page: number })}
            aria-current={number === page ? "page" : undefined}
            className={pageClass(number === page)}
          >
            {number}
            {number === page ? <span className="sr-only"> (หน้าปัจจุบัน)</span> : null}
          </Link>
        ),
      )}

      {page < last ? (
        <Link href={hrefFor({ page: page + 1 })} className={pageClass(false)}>
          ›<span className="sr-only">หน้าถัดไป</span>
        </Link>
      ) : null}
    </nav>
  );
}

function pageClass(active: boolean): string {
  return `inline-flex size-9 items-center justify-center rounded-md border text-sm tabular-nums ${
    active
      ? "border-primary bg-primary font-medium text-white"
      : "border-border text-text-secondary hover:border-primary-200 hover:text-text"
  }`;
}

/** First, last, and the neighbours of the current page - gaps become "…". */
function pageWindow(page: number, last: number): Array<number | null> {
  const wanted = new Set([1, last, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);

  const out: Array<number | null> = [];
  let previous = 0;
  for (const number of pages) {
    if (previous && number - previous > 1) out.push(null);
    out.push(number);
    previous = number;
  }
  return out;
}
