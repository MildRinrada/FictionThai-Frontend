import { expect, test, type Page } from "@playwright/test";

import { COVER_HEIGHT, COVER_WIDTH } from "../../lib/cover";

/**
 * The cover has one shape, measured in a real browser (docs/15 §33).
 *
 * A source check is not enough here, and the reason is specific: a cover sits
 * in a flex row beside a title block, and a flex item with an auto cross size
 * gets STRETCHED to the row height - the declared `aspect-ratio` is overridden
 * at layout time by however long the neighbouring title happens to be. The
 * class says A5, the computed style says A5, and the box on screen is not A5.
 * Only measuring the painted rectangle catches that.
 *
 * Guest pages only: every registration spends the shared Auth-tier budget
 * (docs/10 §38), and the stretch mechanism is the same wherever a cover is
 * drawn.
 */

const A5 = COVER_WIDTH / COVER_HEIGHT;
/** A pixel of rounding on a 40px-wide cover is ~0.002 of the ratio. */
const TOLERANCE = 0.01;

/** Shapes that are deliberately not covers. */
const NOT_A_COVER = new Set(["1 / 1", "16 / 9", "auto", ""]);

async function coverBoxes(page: Page) {
  return page.evaluate((notCover) => {
    const found: { ratio: number; cls: string }[] = [];
    for (const element of document.querySelectorAll("*")) {
      const declared = getComputedStyle(element).aspectRatio;
      if (notCover.includes(declared)) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      found.push({
        ratio: box.width / box.height,
        cls: String((element as HTMLElement).className).slice(0, 80),
      });
    }
    return found;
  }, [...NOT_A_COVER]);
}

test.describe("cover shape", () => {
  for (const [name, path] of [
    ["the home shelves", "/"],
    ["the fiction listing", "/novels"],
  ] as const) {
    test(`${name} paint every cover at A5`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const boxes = await coverBoxes(page);
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(
          Math.abs(box.ratio - A5),
          `${box.cls} painted at ${box.ratio.toFixed(4)}, expected ${A5.toFixed(4)}`,
        ).toBeLessThan(TOLERANCE);
      }
    });
  }

  test("no page still promises a 2:3 cover", async ({ page }) => {
    for (const path of ["/", "/novels", "/studio/novels/new"]) {
      await page.goto(path);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, `${path} still says 2:3`).not.toMatch(/\b2\s*:\s*3\b/);
    }
  });
});
