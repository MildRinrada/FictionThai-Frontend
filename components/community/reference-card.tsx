import Link from "next/link";

import { Cover } from "@/components/fiction/cover";
import {
  referenceHref,
  referenceMeta,
  referenceTitle,
} from "@/lib/post-reference";
import { ageRatingLabel } from "@/types/fiction";
import type { PostReference } from "@/types/community";

/**
 * The fiction card inside a community post
 * (docs/PHASE-12-STORY-DEPTH.md §12D, docs/06 §34).
 *
 * A Server Component with no JavaScript: it is a link and a few lines of text,
 * and it appears on the busiest list on the platform (docs/07 §20).
 *
 * Everything it renders came from the API's read-time resolution. There is no
 * "unavailable" state to design, because a reference the reader may not see
 * never reaches this component - the post simply renders without it. That is
 * also why the card never says which chapter is missing or that a fiction went
 * private: the post is the author's writing, and the fiction's visibility is
 * the fiction author's to control (§12D).
 */

export function ReferenceCard({
  reference,
  label = "ตอนที่แนบมา",
}: {
  reference: PostReference;
  /** The mono micro-label above the title. */
  label?: string;
}) {
  const hasChapter = Boolean(reference.chapter_id);

  return (
    <Link
      href={referenceHref(reference)}
      className="group mt-3 flex items-center gap-3 rounded-md border border-border bg-background p-3 hover:border-primary-200"
    >
      <Cover
        url={reference.cover_url ?? undefined}
        title={reference.novel_title}
        className="w-11"
        showFallbackTitle={false}
      />

      <span className="min-w-0 flex-1">
        <span className="mono-label block text-[10px]">{label}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="min-w-0 truncate font-serif text-sm font-semibold group-hover:text-primary">
            {referenceTitle(reference)}
          </span>
          {/* The same rating badge every fiction card carries: a post about
              18+ work must not present it unbadged (docs/COMMUNITY-FEED.md). */}
          {ageRatingLabel(reference.age_rating) ? (
            <span className="shrink-0 rounded-sm border border-border px-1 text-[10px] whitespace-nowrap text-text-secondary">
              {ageRatingLabel(reference.age_rating)}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">
          {referenceMeta(reference).join(" · ")}
        </span>
      </span>

      <span className="shrink-0 self-center text-xs whitespace-nowrap text-primary">
        {hasChapter ? "อ่านตอนนี้ →" : "เปิดเรื่องนี้ →"}
      </span>
    </Link>
  );
}
