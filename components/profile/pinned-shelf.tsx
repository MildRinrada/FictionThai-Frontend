import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import type { PinnedWork } from "@/types/profile";

/**
 * ชั้นวางเรื่องที่ปักหมุด (docs/PROFILE-AND-ACHIEVEMENTS.md).
 *
 * A profile ordered by recency answers "what did you write last". A new reader
 * is asking "where do I start", and nobody can answer that except the writer -
 * so these three come with one line of their own words rather than a synopsis
 * the platform picked.
 *
 * It sits ABOVE the tabs because it is the answer to the first question, not a
 * section to go looking for. Empty means absent: an empty shelf labelled
 * "ปักหมุด" would be furniture with nothing on it.
 */

export function PinnedShelf({ pinned }: { pinned: PinnedWork[] }) {
  if (pinned.length === 0) return null;

  return (
    <section aria-labelledby="pinned-heading" className="mb-6">
      <p id="pinned-heading" className="mono-label flex items-center gap-1.5">
        <Icon name="pin" size={13} />
        เริ่มที่เรื่องนี้
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {pinned.map((work) => (
          <li
            key={work.novel_id}
            className="rounded-xl border border-primary-200 bg-primary-50/60 p-3.5"
          >
            <Link
              href={`/novel/${encodeURIComponent(work.slug)}`}
              className="font-serif leading-snug font-semibold hover:text-primary"
            >
              {work.title}
            </Link>
            {work.note ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                {work.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
