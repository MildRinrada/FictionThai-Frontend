import Link from "next/link";

import { Cover } from "@/components/fiction/cover";
import { count } from "@/lib/format";
import type { DiscussedFiction } from "@/types/community";

/**
 * "เรื่องที่ถูกพูดถึง" - the community sidebar
 * (docs/PHASE-12-STORY-DEPTH.md §12D).
 *
 * The numbers come from the reference column added in 12D: they are counts of
 * real public posts about fictions anyone may open, not a popularity score and
 * not the statistics phase. A fiction nobody has posted about simply is not
 * here.
 *
 * Renders NOTHING when the list is empty. An empty panel with a heading would
 * claim there is a conversation to join when there is not.
 */
export function DiscussedPanel({ items }: { items: DiscussedFiction[] }) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="discussed-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="discussed-heading" className="mono-label">
        เรื่องที่ถูกคุยถึงมากที่สุดสัปดาห์นี้
      </h2>

      <ol className="mt-3 space-y-3">
        {items.map(({ fiction, post_count }) => (
          <li key={fiction.novel_id}>
            <Link
              href={`/novel/${encodeURIComponent(fiction.novel_slug)}`}
              className="group flex items-center gap-2.5"
            >
              <Cover
                url={fiction.cover_url ?? undefined}
                title={fiction.novel_title}
                className="w-9"
                showFallbackLabel={false}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-[13px] leading-snug font-semibold group-hover:text-primary">
                  {fiction.novel_title}
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {count(post_count)} โพสต์
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
