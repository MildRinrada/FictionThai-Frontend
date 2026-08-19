"use client";

import { useState } from "react";
import Link from "next/link";

import { Cover } from "@/components/fiction/cover";
import { Icon } from "@/components/ui/icon";

/**
 * ค้นพบเรื่องใหม่ - three editorial questions (home review A7, 2026-08).
 *
 * The question is the point: a reader who does not know what they want is
 * served better by "อยากอ่านจบในคืนเดียวไหม" than by another ranked row. The
 * review's fix: ONE answer per question read as a loading failure, so each
 * question now answers with up to three, and สุ่มใหม่ redeals from the pool
 * the server already sent - no request, no layout shift.
 *
 * The initial deal is the pool's own order (deterministic), so the server and
 * client render the same HTML; randomness happens only on the writer's click.
 */

/** The slice of a fiction this section needs - not the whole resource. */
export interface DiscoverNovel {
  slug: string;
  title: string;
  author: string;
  cover_url?: string;
}

export interface DiscoverColumn {
  question: string;
  href: string;
  pool: DiscoverNovel[];
}

const ANSWERS_PER_QUESTION = 3;

function deal(pool: DiscoverNovel[], shuffle: boolean): DiscoverNovel[] {
  if (!shuffle || pool.length <= ANSWERS_PER_QUESTION) {
    return pool.slice(0, ANSWERS_PER_QUESTION);
  }
  const rest = [...pool];
  const picked: DiscoverNovel[] = [];
  while (picked.length < ANSWERS_PER_QUESTION && rest.length > 0) {
    picked.push(...rest.splice(Math.floor(Math.random() * rest.length), 1));
  }
  return picked;
}

export function DiscoverQuestions({ columns }: { columns: DiscoverColumn[] }) {
  const [round, setRound] = useState(0);
  const [deals, setDeals] = useState(() =>
    columns.map((column) => deal(column.pool, false)),
  );

  const canShuffle = columns.some(
    (column) => column.pool.length > ANSWERS_PER_QUESTION,
  );

  if (columns.length === 0) return null;

  return (
    <div>
      <ul className="grid gap-x-8 gap-y-6 border-t border-hairline pt-6 sm:grid-cols-3">
        {columns.map((column, index) => (
          <li
            key={column.question}
            className="sm:border-s sm:border-hairline sm:ps-6 sm:first:border-s-0 sm:first:ps-0"
          >
            <p className="font-serif text-base font-semibold">{column.question}</p>
            <ul className="mt-3.5 flex flex-col gap-3">
              {deals[index].map((novel) => (
                <li key={`${round}-${novel.slug}`}>
                  <Link
                    href={`/novel/${encodeURIComponent(novel.slug)}`}
                    className="group flex gap-3"
                  >
                    <Cover
                      url={novel.cover_url}
                      title={novel.title}
                      className="w-12"
                      showFallbackTitle={false}
                    />
                    <span className="min-w-0 self-center">
                      <span className="block truncate font-serif text-sm font-semibold group-hover:text-primary">
                        {novel.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {novel.author}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={column.href}
              className="mt-3.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              ดูเรื่องแบบนี้ทั้งหมด
              <Icon name="arrow-right" size={13} />
            </Link>
          </li>
        ))}
      </ul>

      {canShuffle ? (
        <button
          type="button"
          onClick={() => {
            setDeals(columns.map((column) => deal(column.pool, true)));
            setRound((value) => value + 1);
          }}
          className="mt-5 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
        >
          <Icon name="sparkle" size={14} />
          สุ่มใหม่
        </button>
      ) : null}
    </div>
  );
}
