import Link from "next/link";

import { Icon } from "@/components/ui/icon";

/**
 * A section heading.
 *
 * The structural device the whole site is built from: a serif Thai heading, an
 * optional one-line description beneath it, and an optional quiet link out.
 * Sections are separated by type and space rather than by coloured bars - which
 * is what keeps the page reading as an edited publication instead of a portal.
 */
export function SectionHeader({
  title,
  description,
  href,
  linkLabel = "ดูทั้งหมด",
  id,
}: {
  title: string;
  /**
   * Only when it tells the reader something the title does not - how a ranking
   * is counted, say. A translation of the title is not a description.
   */
  description?: string;
  href?: string;
  linkLabel?: string;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h2 id={id} className="font-serif text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>

      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {linkLabel}
          <Icon name="arrow-right" size={15} />
        </Link>
      ) : null}
    </div>
  );
}
