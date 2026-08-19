import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { count, relativeTime } from "@/lib/format";
import type { Novel } from "@/types/novel";
import type { ReactNode } from "react";

/**
 * กำลังเขียนอยู่ - the unfinished work, and whether a new chapter is coming.
 *
 * A reader looking at a writer's profile is usually asking one question, and it
 * is not "how many words have you written": it is จะมีตอนใหม่ไหม. The ผลงาน
 * grid cannot answer it - a cover and a title say nothing about whether the
 * story is still moving.
 *
 * So each row states what is known and refuses to state what is not: chapters
 * so far, when the last one arrived, and the rhythm ONLY when the last few
 * updates actually establish one. A promised schedule the platform invented
 * from two data points would be worse than silence, because a reader would
 * hold the writer to it.
 */

export function WritingNowPanel({
  works,
  fallback,
}: {
  works: Novel[];
  fallback: ReactNode;
}) {
  const ongoing = works.filter((novel) => novel.status === "ongoing");
  if (ongoing.length === 0) return <>{fallback}</>;

  return (
    <ul className="flex flex-col gap-3">
      {ongoing.map((novel) => (
        <li
          key={novel.id}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/novel/${encodeURIComponent(novel.slug)}`}
                className="font-serif text-lg leading-snug font-semibold hover:text-primary"
              >
                {novel.title}
              </Link>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                <span className="tabular-nums">{count(novel.chapter_count)} ตอน</span>
                {novel.updated_at ? (
                  <span>· อัปเดตล่าสุด {relativeTime(novel.updated_at)}</span>
                ) : null}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-text-secondary">
              <Icon name="edit" size={12} />
              กำลังเขียน
            </span>
          </div>

          {novel.tagline ? (
            <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
              {novel.tagline}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
