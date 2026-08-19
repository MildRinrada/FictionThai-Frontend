import { describe, expect, it } from "vitest";

import { tallyChapters, tallyLine } from "@/lib/chapter-tally";
import type { ChapterStatus } from "@/types/novel";

/**
 * The one source of chapter counts (§13T).
 *
 * The regression this file pins: the rail once printed the owner's TOTAL as
 * "เผยแพร่แล้ว" while the overview counted published rows from the list, and
 * the same screen showed 8 and 1. Every studio surface now derives from this
 * function, so the function itself carries the definitions.
 */

const chapter = (status: ChapterStatus, published_at?: string) => ({
  status,
  published_at,
});

describe("tallyChapters", () => {
  it("counts each state from the same rules the overview lists by", () => {
    const tally = tallyChapters([
      chapter("published", "2026-08-01T00:00:00Z"),
      chapter("published", "2026-08-02T00:00:00Z"),
      chapter("scheduled"),
      chapter("draft"),
      chapter("draft"),
      chapter("unpublished", "2026-07-01T00:00:00Z"),
    ]);

    expect(tally).toEqual({
      total: 6,
      published: 2,
      scheduled: 1,
      drafts: 2,
      unpublished: 1,
    });
  });

  it("does not call a formerly-published chapter a draft", () => {
    // A draft row with a publication date behind it has been OUT - it is not
    // unfinished work, and must not appear in "ทำต่อจากที่ค้างไว้"'s count.
    const tally = tallyChapters([chapter("draft", "2026-08-01T00:00:00Z")]);
    expect(tally.drafts).toBe(0);
  });

  it("reports zeros for an empty story", () => {
    expect(tallyChapters([]).total).toBe(0);
  });
});

describe("tallyLine", () => {
  it("always states the published count and omits empty states", () => {
    expect(
      tallyLine({ total: 1, published: 1, scheduled: 0, drafts: 0, unpublished: 0 }),
    ).toBe("เผยแพร่แล้ว 1 ตอน");
  });

  it("appends the states that exist, in work order, each named in full", () => {
    // "ถอนออก 1" was misread as "ตอนออก 1" - the label must survive being
    // skimmed beside a Thai chapter count.
    expect(
      tallyLine({ total: 12, published: 8, scheduled: 1, drafts: 2, unpublished: 1 }),
    ).toBe("เผยแพร่แล้ว 8 ตอน · ตั้งเวลาไว้ 1 · ร่าง 2 · ถอนจากเผยแพร่ 1");
  });
});
