"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import { ageRatingLabel, presentationLabel, PresentationFormat } from "@/types/fiction";
import type { Novel, NovelStatus } from "@/types/novel";

/**
 * The library's shared small parts (library redesign 2026-08): the four facts
 * every fiction card must carry, the numbered pager, and the empty-state
 * frame that offers a MOVE instead of a grey box.
 */

export const NOVEL_STATUS_LABELS: Record<string, string> = {
  ongoing: "กำลังเขียน",
  completed: "จบแล้ว",
  hiatus: "พักไว้",
};

export function statusLabel(status: NovelStatus): string {
  return NOVEL_STATUS_LABELS[status] ?? status;
}

/**
 * The four decision facts (library review §UX): format, age rating, story
 * status, extent. Every list in the library shows the same row, so a reader
 * never has to open a page to remember what a thing is.
 */
export function NovelFacts({ novel }: { novel: Novel }) {
  const format = novel.has_mixed_formats
    ? "ผสมรูปแบบ"
    : presentationLabel(novel.presentation_format ?? PresentationFormat.Standard);
  const rating = ageRatingLabel(novel.age_rating);
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
      {format ? (
        <span className="inline-flex min-h-5 items-center rounded-sm border border-border px-1.5 font-mono">
          {format}
        </span>
      ) : null}
      {/* ทุกวัย has no label by design (ageRatingLabel), and an EMPTY bordered
          box is worse than no box. */}
      {rating ? (
        <span className="inline-flex min-h-5 items-center rounded-sm border border-border px-1.5 font-mono">
          {rating}
        </span>
      ) : null}
      <span>{statusLabel(novel.status)}</span>
      <span aria-hidden>·</span>
      <span>
        {novel.uses_chapter_navigation ? `${count(novel.chapter_count)} ตอน` : "จบในตอน"}
      </span>
    </span>
  );
}

/** Total pages from a collection's meta - the API sends page/per_page/total. */
export function totalPagesOf(meta: { total: number; per_page: number } | null): number {
  if (!meta || meta.per_page <= 0) return 1;
  return Math.max(1, Math.ceil(meta.total / meta.per_page));
}

/**
 * Numbered pages, never an infinite scroll (library review §UX): a page has
 * an address, and an address can be sent to someone.
 */
export function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  for (let at = 1; at <= totalPages; at += 1) {
    if (at === 1 || at === totalPages || Math.abs(at - page) <= 2) pages.push(at);
  }
  const deduped = pages.filter((value, index) => pages.indexOf(value) === index);

  return (
    <nav aria-label="หน้า" className="mt-4 flex items-center justify-center gap-1">
      {deduped.map((value, index) => (
        <span key={value} className="flex items-center gap-1">
          {index > 0 && deduped[index - 1] !== value - 1 ? (
            <span aria-hidden className="px-1 text-xs text-text-muted">
              …
            </span>
          ) : null}
          <button
            type="button"
            aria-current={value === page ? "page" : undefined}
            onClick={() => onPage(value)}
            className={`inline-flex size-8 items-center justify-center rounded-md text-sm ${
              value === page
                ? "bg-primary font-medium text-white"
                : "text-text-secondary hover:bg-surface-secondary hover:text-text"
            }`}
          >
            {count(value)}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** The empty state that offers a move (library review §empty states). */
export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-secondary text-text-muted">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-sm font-medium text-text">{title}</p>
      {body ? <p className="max-w-sm text-xs leading-relaxed text-text-secondary">{body}</p> : null}
      {children}
    </div>
  );
}

/** A small avatar for a followed author. */
export function AuthorAvatar({
  name,
  avatarURL,
  size = 40,
}: {
  name: string;
  avatarURL?: string | null;
  size?: number;
}) {
  if (avatarURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- own media route
      <img
        src={avatarURL}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-primary-50 font-medium text-primary"
    >
      {[...name][0] ?? "?"}
    </span>
  );
}

/** The novel page path - one place, so a link never drifts. */
export function novelPath(novel: Novel): string {
  return `/novel/${encodeURIComponent(novel.slug)}`;
}

export function NovelTitleLink({ novel }: { novel: Novel }) {
  return (
    <Link
      href={novelPath(novel)}
      className="line-clamp-1 font-medium text-text hover:text-primary"
    >
      {novel.title}
    </Link>
  );
}
