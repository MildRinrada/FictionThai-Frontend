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
 * A fiction without a cover gets a striped warm neutral, a picture glyph, and
 * the words "ไม่มีภาพหน้าปก". It used to repeat the fiction's own title, which
 * every card already prints directly underneath - so the box said nothing new
 * and read like artwork that had failed to load. Naming the absence is the
 * honest version, and it tells a writer looking at their own shelf exactly
 * which fiction still needs a cover.
 *
 * The glyph and the caption size themselves against the BOX, not the page
 * (`.cover-fallback` in globals.css), so the same component serves a 36px list
 * thumbnail and a full-width shelf card without a size prop.
 */

import { Icon } from "@/components/ui/icon";
import { COVER_ASPECT } from "@/lib/cover";

export interface CoverProps {
  url?: string;
  title: string;
  /** Tailwind width class for the box, e.g. "w-11" or "w-full". */
  className?: string;
  /**
   * Show the "ไม่มีภาพหน้าปก" caption under the glyph. Off for covers that sit
   * beside their own title anyway; below ~4rem the stylesheet drops it too,
   * because at that size it is a smudge and the glyph already says it.
   */
  showFallbackLabel?: boolean;
}

export function Cover({
  url,
  title,
  className = "w-full",
  showFallbackLabel = true,
}: CoverProps) {
  return (
    <span
      className={`relative block ${COVER_ASPECT} shrink-0 self-start overflow-hidden rounded-sm border border-border ${!url ? "art-placeholder cover-fallback" : ""} ${className}`}
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
      ) : (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-[6%] p-2 text-center text-text-muted"
          // The fiction is named beside every cover; repeating it to a screen
          // reader here would be noise.
          title={title}
        >
          <Icon name="image" className="cover-fallback-glyph opacity-55" />
          {showFallbackLabel ? (
            <span className="cover-fallback-text leading-snug font-medium">
              ไม่มีภาพหน้าปก
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
