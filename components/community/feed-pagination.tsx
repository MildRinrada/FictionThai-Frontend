import Link from "next/link";

import { count } from "@/lib/format";

/**
 * Numbered pages for the community feed (docs/COMMUNITY-FEED.md) - the same
 * window rule as the library's Pager (1 and last always, ±2 around current,
 * … in the gaps), but rendered as LINKS: the feed page is a Server Component
 * and every page must have a shareable address that works before hydration.
 */
export function FeedPagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  /** Builds the href for one page number, preserving the current filters. */
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  for (let at = 1; at <= totalPages; at += 1) {
    if (at === 1 || at === totalPages || Math.abs(at - page) <= 2) pages.push(at);
  }
  const deduped = pages.filter((value, index) => pages.indexOf(value) === index);

  return (
    <nav aria-label="หน้าฟีด" className="mt-6 flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          aria-label="หน้าก่อนหน้า"
          className="inline-flex size-8 items-center justify-center rounded-md text-sm text-text-secondary hover:bg-surface-secondary hover:text-text"
        >
          ←
        </Link>
      ) : null}

      {deduped.map((value, index) => (
        <span key={value} className="flex items-center gap-1">
          {index > 0 && deduped[index - 1] !== value - 1 ? (
            <span aria-hidden className="px-1 text-xs text-text-muted">
              …
            </span>
          ) : null}
          <Link
            href={hrefFor(value)}
            aria-current={value === page ? "page" : undefined}
            className={`inline-flex size-8 items-center justify-center rounded-md text-sm ${
              value === page
                ? "bg-primary font-medium text-white"
                : "text-text-secondary hover:bg-surface-secondary hover:text-text"
            }`}
          >
            {count(value)}
          </Link>
        </span>
      ))}

      {page < totalPages ? (
        <Link
          href={hrefFor(page + 1)}
          aria-label="หน้าถัดไป"
          className="inline-flex size-8 items-center justify-center rounded-md text-sm text-text-secondary hover:bg-surface-secondary hover:text-text"
        >
          →
        </Link>
      ) : null}
    </nav>
  );
}
