/**
 * The one cover shape, defined once.
 *
 * A5 at 300 DPI - 1748×2480 - the standard a Thai cover artist already designs
 * to. Everything that renders a cover uses `COVER_ASPECT`, and the editor
 * exports at exactly `COVER_WIDTH`×`COVER_HEIGHT`, so the crop a writer
 * positions is the crop every card shows.
 *
 * This file exists because the ratio was previously written out by hand in
 * four places and two of them disagreed: the editor cropped one shape and the
 * shelf displayed another, so every card quietly re-cropped the artwork a
 * second time and the writer never saw where the second cut fell. One constant
 * is the only way that stays fixed.
 *
 * The class name is written as a LITERAL here rather than composed, because
 * Tailwind scans source text for class names - a computed string would produce
 * no CSS at all.
 */

export const COVER_WIDTH = 1748;
export const COVER_HEIGHT = 2480;

/** Tailwind's aspect utility for the cover box. */
export const COVER_ASPECT = "aspect-[1748/2480]";

/**
 * The profile cover band - 5:1.
 *
 * It is a RATIO and not a height for the same reason the fiction cover is: the
 * band used to be a fixed 144px/176px, which is ~5.9:1 on a desktop and ~2.6:1
 * on a phone - so the crop a writer positioned could not possibly match what
 * anyone else saw, and the file stored (4:1) matched neither. One ratio means
 * the band the writer drags, the file that is stored, and the band a visitor
 * sees are the same rectangle at every width.
 *
 * 5:1 rather than the 3:1 a social profile uses, because this band sits above a
 * page of fiction rather than being the page: at the shell's width it lands
 * near the 176px the design already used, instead of taking a third of the
 * screen before the writer's name.
 */
export const BANNER_WIDTH = 1600;
export const BANNER_HEIGHT = 320;

/** Tailwind's aspect utility for the profile cover band. */
export const BANNER_ASPECT = "aspect-[1600/320]";
