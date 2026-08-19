"use client";

import Link from "next/link";
import { useState } from "react";

import { Cover } from "@/components/fiction/cover";
import { Icon } from "@/components/ui/icon";
import { NovelFacts, novelPath } from "@/features/library/shared";
import { highlight, matches } from "@/features/search/highlight";
import { bookmarkNovel } from "@/lib/library-client";
import type { Novel } from "@/types/novel";
import { AgeRating } from "@/types/novel";

/**
 * One search result (search review 2026-08 section D).
 *
 * The default is a LIST row, not a cover grid: a searcher compares candidates
 * top-to-bottom, and rows of equal height compare where masonry gaps do not.
 * The grid variant exists for the reader who browses by cover.
 *
 * The badge row is ONE system set in a fixed order - format · age rating ·
 * story status · extent - via the library's NovelFacts, which already speaks
 * the reader vocabulary (กำลังเขียน / จบแล้ว / พักไว้, never the writer's
 * "กำลังเผยแพร่"). Tags and ships sit on their own quieter row below, so the
 * platform's labels and the writer's labels never blur together (D2).
 */

function authorName(novel: Novel): string {
  return novel.pen_name ?? novel.author.display_name ?? novel.author.username;
}

/**
 * Where the query matched, when nowhere VISIBLE on the card shows it (D5):
 * without this line, a card whose match is buried in a tag reads as noise.
 */
function matchSource(novel: Novel, q: string): string | null {
  if (!q.trim()) return null;
  if (matches(novel.title, q) || matches(novel.tagline, q) || matches(novel.description, q)) {
    return null; // Visible and highlighted in place.
  }
  const tag = novel.tags.find((term) => matches(term.name, q));
  if (tag) return `ตรงกับแท็ก: ${tag.name}`;
  const genre = novel.genres.find((term) => matches(term.name, q));
  if (genre) return `ตรงกับหมวด: ${genre.name}`;
  if (matches(novel.fandom, q)) return `ตรงกับแฟนด้อม: ${novel.fandom ?? ""}`;
  if (matches(novel.author.username, q) || matches(novel.author.display_name, q)) {
    return `ตรงกับนักเขียน: ${authorName(novel)}`;
  }
  return null;
}

function isAdult(novel: Novel): boolean {
  return novel.age_rating === AgeRating.Mature || novel.age_rating === AgeRating.Explicit;
}

/**
 * The cover, blurred for 18+ work. The reader has already opted in to SEE
 * these results (§13B keeps them out otherwise) - the blur keeps the artwork
 * itself off the screen until they choose this card, which is what the age
 * policy asks of a browse surface.
 */
function ResultCover({ novel, className }: { novel: Novel; className: string }) {
  const adult = isAdult(novel);
  return (
    <span className={`relative block shrink-0 self-start ${className}`}>
      <span className={`block ${adult ? "blur-sm" : ""}`}>
        {/* A coverless work keeps a plain placeholder - repeating the title
            inside the box just prints it twice on one card (D4). */}
        <Cover url={novel.cover_url} title={novel.title} showFallbackTitle={false} />
      </span>
      {adult ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-sm bg-black/25 font-mono text-[11px] font-semibold text-white">
          18+
        </span>
      ) : null}
    </span>
  );
}

/** The quieter row: the writer's own vocabulary, never mixed into the facts. */
function TermRow({ novel }: { novel: Novel }) {
  const terms = [...novel.genres, ...novel.tags];
  if (terms.length === 0 && !novel.has_reader_variables) return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1">
      {novel.has_reader_variables ? (
        <span
          className="inline-flex min-h-5 items-center rounded-full bg-primary-50 px-2 font-mono text-[10px] text-primary"
          title="เรื่องนี้ใส่ชื่อผู้อ่านลงในเนื้อเรื่องได้"
        >
          y/n
        </span>
      ) : null}
      {terms.slice(0, 6).map((term) => (
        <span
          key={term.id}
          className="inline-flex min-h-5 items-center rounded-full bg-surface-secondary px-2 text-[10px] text-text-secondary"
        >
          {term.name}
        </span>
      ))}
    </span>
  );
}

/** The hover quick actions (D6): three clicks down to one. */
function QuickActions({ novel, signedIn }: { novel: Novel; signedIn: boolean }) {
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {novel.first_chapter_slug ? (
        <Link
          href={`/read/${encodeURIComponent(novel.slug)}/${encodeURIComponent(novel.first_chapter_slug)}`}
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
        >
          <Icon name="book" size={14} />
          อ่านตอนแรก
        </Link>
      ) : null}
      {signedIn ? (
        <button
          type="button"
          disabled={saved}
          onClick={() => {
            setFailed(false);
            bookmarkNovel(novel.slug)
              .then(() => setSaved(true))
              .catch(() => setFailed(true));
          }}
          className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2.5 text-xs ${
            saved
              ? "border-primary-200 text-primary"
              : "border-border text-text-secondary hover:border-primary-200 hover:text-primary"
          }`}
        >
          <Icon name={saved ? "check" : "bookmark"} size={14} />
          {saved ? "บันทึกแล้ว" : failed ? "ลองอีกครั้ง" : "บันทึกเข้าชั้น"}
        </button>
      ) : null}
    </span>
  );
}

export function ResultRow({
  novel,
  q,
  signedIn,
}: {
  novel: Novel;
  q: string;
  signedIn: boolean;
}) {
  const source = matchSource(novel, q);
  return (
    <article className="group relative flex gap-4 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-primary-200">
      <Link href={novelPath(novel)} className="shrink-0" tabIndex={-1} aria-hidden>
        <ResultCover novel={novel} className="w-16 sm:w-20" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-serif text-[15px] leading-snug font-semibold">
            <Link
              href={novelPath(novel)}
              data-search-result
              className="line-clamp-2 text-text hover:text-primary focus-visible:text-primary"
            >
              {highlight(novel.title, q)}
            </Link>
          </h3>
          <QuickActions novel={novel} signedIn={signedIn} />
        </div>

        <p className="mt-0.5 text-xs text-text-secondary">
          {authorName(novel)}
          {novel.fandom ? <span className="text-text-muted"> · ด้อม: {novel.fandom}</span> : null}
        </p>

        {novel.tagline || novel.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">
            {highlight(novel.tagline ?? novel.description ?? "", q)}
          </p>
        ) : null}

        {source ? <p className="mt-1 text-[11px] text-text-muted">{source}</p> : null}

        <div className="mt-2">
          <NovelFacts novel={novel} />
        </div>
        <TermRow novel={novel} />
      </div>
    </article>
  );
}

export function ResultTile({
  novel,
  q,
  signedIn,
}: {
  novel: Novel;
  q: string;
  signedIn: boolean;
}) {
  return (
    <article className="group relative flex flex-col gap-2">
      <Link href={novelPath(novel)} tabIndex={-1} aria-hidden>
        <ResultCover novel={novel} className="w-full" />
      </Link>
      <h3 className="font-serif text-[13px] leading-snug font-semibold">
        <Link
          href={novelPath(novel)}
          data-search-result
          className="line-clamp-2 text-text hover:text-primary"
        >
          {highlight(novel.title, q)}
        </Link>
      </h3>
      <p className="text-[11px] text-text-secondary">{authorName(novel)}</p>
      <NovelFacts novel={novel} />
      <QuickActions novel={novel} signedIn={signedIn} />
    </article>
  );
}
