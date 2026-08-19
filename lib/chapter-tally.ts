import type { ChapterSummary } from "@/types/novel";

/**
 * The one place chapter counts come from (§13T).
 *
 * The studio used to compute its numbers in three places - the rail read the
 * novel's own counters, the overview filtered the chapter list, and the backlog
 * filtered it differently - and the three disagreed on the same screen. The
 * rail's worst offence: for an owner `chapter_count` is EVERY chapter, and the
 * rail printed it as "เผยแพร่แล้ว".
 *
 * Every studio surface now derives its numbers from this function over the
 * owner's chapter list, so two counts on one screen cannot disagree without
 * one of them not using it - which is the bug to reject in review.
 */
export interface ChapterTally {
  total: number;
  published: number;
  scheduled: number;
  /**
   * Chapters that have never been out: drafts with no publication date behind
   * them. This is exactly what "ทำต่อจากที่ค้างไว้" lists, so the rail's
   * "ร่าง N" and the backlog's row count are the same N by construction.
   */
  drafts: number;
  /** Taken down after being published. Finished writing, not a draft. */
  unpublished: number;
}

export function tallyChapters(
  chapters: ReadonlyArray<Pick<ChapterSummary, "status" | "published_at">>,
): ChapterTally {
  const tally: ChapterTally = {
    total: chapters.length,
    published: 0,
    scheduled: 0,
    drafts: 0,
    unpublished: 0,
  };
  for (const chapter of chapters) {
    if (chapter.status === "published") tally.published += 1;
    else if (chapter.status === "scheduled") tally.scheduled += 1;
    else if (chapter.status === "unpublished") tally.unpublished += 1;
    else if (!chapter.published_at) tally.drafts += 1;
  }
  return tally;
}

/**
 * The rail's one-line summary of the tally, in the order a writer cares:
 * what is out, what is queued, what is waiting for them.
 *
 * Every segment names its state in full. The line once read "ถอนออก 1", which
 * a reader parsed as "ตอนออก 1" and could not decode at all - a two-word label
 * on a one-line summary is not the place to save characters.
 */
export function tallyLine(tally: ChapterTally): string {
  const parts = [`เผยแพร่แล้ว ${tally.published} ตอน`];
  if (tally.scheduled > 0) parts.push(`ตั้งเวลาไว้ ${tally.scheduled}`);
  if (tally.drafts > 0) parts.push(`ร่าง ${tally.drafts}`);
  if (tally.unpublished > 0) parts.push(`ถอนจากเผยแพร่ ${tally.unpublished}`);
  return parts.join(" · ");
}
