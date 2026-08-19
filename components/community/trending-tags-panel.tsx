import Link from "next/link";

import { count } from "@/lib/format";
import type { TrendingTag } from "@/types/community";

/**
 * "แท็กที่กำลังพูดถึง" (docs/COMMUNITY-FEED.md): the hashtags recent public
 * posts used most, counted server-side from the write-time extraction. Each
 * chip is a link into the post search, so a tag IS a saved query.
 *
 * Renders nothing when empty, like the discussed panel - an empty heading
 * would claim a conversation that is not happening.
 */
export function TrendingTagsPanel({ items }: { items: TrendingTag[] }) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="trending-tags-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="trending-tags-heading" className="mono-label">
        แท็กที่กำลังพูดถึง
      </h2>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {items.map(({ tag, post_count }) => (
          <li key={tag}>
            <Link
              href={`/community?q=${encodeURIComponent(`#${tag}`)}`}
              className="inline-flex min-h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
            >
              #{tag}
              <span className="font-mono text-[10px] text-text-muted">
                {count(post_count)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
