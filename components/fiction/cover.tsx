/**
 * A fiction cover.
 *
 * Covers are the only place FictionThai lets colour run free: the shell stays
 * neutral so the artwork carries the page (docs/05 §8). Every cover holds a
 * fixed box whether or not artwork exists, so a shelf never reflows as images
 * arrive.
 *
 * That box is A5 (`COVER_ASPECT`), the same shape the editor crops to and the
 * standard a cover artist already designs to. It used to be 3:4 here while the
 * editor produced something else, so every card cropped the artwork a SECOND
 * time - the writer positioned their cover, and the shelf quietly cut the top
 * and bottom off it. One constant, in lib/cover.ts, is the only way a writer
 * can trust what they saw in the editor.
 *
 * `self-start` is part of that promise, not a layout preference: a cover often
 * sits in a flex row next to a title block, and a flex item with an auto cross
 * size is STRETCHED to the row's height - which silently overrides the aspect
 * ratio and squashes the artwork by however much taller the text happens to
 * be. The ratio then depends on the length of the title beside it.
 *
 * A fiction without a cover falls back to a striped warm neutral plus its own
 * title set in serif - a legible object rather than a grey hole.
 */

import { COVER_ASPECT } from "@/lib/cover";

export interface CoverProps {
  url?: string;
  title: string;
  /** Tailwind width class for the box, e.g. "w-11" or "w-full". */
  className?: string;
  /** Show the title inside the placeholder. Off for very small covers. */
  showFallbackTitle?: boolean;
}

export function Cover({
  url,
  title,
  className = "w-full",
  showFallbackTitle = true,
}: CoverProps) {
  return (
    <span
      className={`relative block ${COVER_ASPECT} shrink-0 self-start overflow-hidden rounded-sm border border-border ${!url ? "art-placeholder" : ""} ${className}`}
    >
      {url ? (
        // Covers are served from object storage, an origin the image optimizer
        // has no configured loader for.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : showFallbackTitle ? (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center font-serif text-[11px] leading-snug font-medium text-text-muted">
          <span className="line-clamp-3">{title}</span>
        </span>
      ) : null}
    </span>
  );
}
