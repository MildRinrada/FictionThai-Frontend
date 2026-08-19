import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BANNER_ASPECT,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  COVER_ASPECT,
  COVER_HEIGHT,
  COVER_WIDTH,
} from "@/lib/cover";

/**
 * One cover shape, enforced against the source itself.
 *
 * The ratio was previously spelled out by hand in several places and they
 * disagreed: the crop tool produced one shape, the shelf card displayed
 * another, and the create form drew a third. Every card then silently
 * re-cropped the artwork a second time, at a place the writer had never seen
 * and could not choose. Unifying them once fixes today; this test is what
 * stops the next hand-written `aspect-…` or "2:3" caption from splitting them
 * again, because a stray one is invisible until a writer notices their cover
 * is cut.
 */

const ROOT = join(__dirname, "..", "..");
const SOURCE_DIRS = ["app", "components", "features", "lib"];

/**
 * Shapes that are legitimately not fiction covers. `BANNER_ASPECT` is the
 * profile band - a different object with its own single constant, held to the
 * same rule: declared once in lib/cover.ts, never written out by hand.
 */
const NON_COVER_ASPECTS = new Set([
  "aspect-square",
  "aspect-video",
  "aspect-auto",
  BANNER_ASPECT,
]);

function sourceFiles() {
  const found: string[] = [];
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir), found);
  return found;
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(path, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
}

describe("the cover has exactly one shape", () => {
  it("declares no aspect ratio that is not COVER_ASPECT", () => {
    const strays: string[] = [];

    for (const file of sourceFiles()) {
      const body = readFileSync(file, "utf8");
      const uses = body.match(/aspect-(\[[^\]]+\]|[\w./]+)/g) ?? [];
      for (const use of uses) {
        if (use === COVER_ASPECT || NON_COVER_ASPECTS.has(use)) continue;
        strays.push(`${relative(ROOT, file)}: ${use}`);
      }
      // A `aspect-ratio:` in an inline style dodges the class check.
      if (/aspectRatio\s*:/.test(body)) strays.push(`${relative(ROOT, file)}: inline aspectRatio`);
    }

    expect(strays).toEqual([]);
  });

  it("shows no hand-written ratio caption to writers", () => {
    // "2:3" in a caption is a promise about the crop, and it is now a lie.
    const captions: string[] = [];
    for (const file of sourceFiles()) {
      const body = readFileSync(file, "utf8");
      for (const line of body.split("\n")) {
        // Comments explain the history; only rendered strings mislead.
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (/\b[23]:[34]\b/.test(line)) captions.push(`${relative(ROOT, file)}: ${line.trim()}`);
      }
    }

    expect(captions).toEqual([]);
  });

  it("exports at the A5 size the shape describes", () => {
    // The stored file and the displayed box must be the same rectangle, or
    // the crop the writer positioned is not the crop that gets shown.
    expect(COVER_ASPECT).toBe(`aspect-[${COVER_WIDTH}/${COVER_HEIGHT}]`);
    expect(COVER_WIDTH / COVER_HEIGHT).toBeCloseTo(1748 / 2480, 5);
  });

  it("cuts the profile band to the shape it stores", () => {
    // The band a writer drags and the file that is stored must be the same
    // rectangle, or the crop they positioned is not the crop anyone sees.
    expect(BANNER_ASPECT).toBe(`aspect-[${BANNER_WIDTH}/${BANNER_HEIGHT}]`);
    expect(BANNER_WIDTH / BANNER_HEIGHT).toBeCloseTo(5, 5);
  });
});
