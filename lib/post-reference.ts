import { count, readingMinutes } from "@/lib/format";
import { contentModeLabel, presentationLabel } from "@/types/fiction";
import type { PostReference } from "@/types/community";

/**
 * How a post's attached fiction reads on a card
 * (docs/PHASE-12-STORY-DEPTH.md §12D).
 *
 * Separate from the component so the rules can be asserted directly: what the
 * card links to, what it is allowed to say, and - the part that matters - that
 * it never invents a chapter, a word count, or a reading time the API did not
 * send. Every field on a reference is optional because a post may attach a
 * whole fiction rather than a chapter.
 */

/** Where the card points: the chapter when there is one, else the fiction. */
export function referenceHref(reference: PostReference): string {
  const novel = encodeURIComponent(reference.novel_slug);
  if (reference.chapter_slug) {
    return `/read/${novel}/${encodeURIComponent(reference.chapter_slug)}`;
  }
  return `/novel/${novel}`;
}

/** "ปลายฝนที่ท่าน้ำเก่า · ตอนที่ 7 น้ำขึ้นตอนตีสาม" */
export function referenceTitle(reference: PostReference): string {
  if (!reference.chapter_id) return reference.novel_title;

  const number = reference.chapter_number;
  const chapter = [
    number === null || number === undefined ? "" : `ตอนที่ ${number}`,
    reference.chapter_title ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return [reference.novel_title, chapter].filter(Boolean).join(" · ");
}

/**
 * "ฟิค · 2,140 คำ · ~9 นาที" - only the parts that have a source.
 *
 * A fiction-level card has no word count, so it gets no reading time either;
 * an unknown future format contributes nothing rather than the word
 * `undefined` (docs/09 §52).
 */
export function referenceMeta(reference: PostReference): string[] {
  const parts = [presentationLabel(reference.presentation_format)];

  const mode = contentModeLabel(reference.content_mode);
  if (mode) parts.push(mode);

  const words = reference.word_count;
  if (words) {
    parts.push(`${count(words)} คำ`);
    parts.push(`~${readingMinutes(words)} นาที`);
  }

  return parts.filter(Boolean);
}
