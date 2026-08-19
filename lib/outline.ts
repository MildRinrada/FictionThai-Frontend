/**
 * สารบัญในตอน - the structure of one chapter's prose.
 *
 * A long chapter is a document, and a document needs a way to walk it. The
 * editor's only navigation was the scrollbar, which on a 20,000-word chapter is
 * a writer dragging a 3-pixel thumb looking for a character's name.
 *
 * What counts as a heading is the load-bearing decision here, and it was made by
 * reading real chapters rather than the markup spec. Almost none of them use
 * `##`: a Thai fiction writer separates a section with a rule and a bold line -
 *
 *     ---
 *
 *     **เอเธอร์ (Aether)**
 *
 * - which is how the format is written everywhere the audience already reads.
 * An outline that only recognised `##` would be empty on the documents that need
 * it most, so a bold line is a heading when it stands alone AFTER A RULE (or
 * opens the chapter). The rule is what makes it precise: `**ตูม!**` in the middle
 * of an action scene is also a whole-bold paragraph, and is not a section - it
 * follows prose, not a separator.
 *
 * Nothing here writes. The outline is a READING of the manuscript: no heading is
 * inserted, no text is normalised, and a writer who never types a heading simply
 * gets no outline (docs/CONTENT-MODEL.md - the author's text is the author's).
 */

import { parseInline, type Inline } from "@/lib/markup";
import { wordsIn } from "@/lib/format";

/**
 * The longest a bold line may be and still be read as a heading.
 *
 * A section title is a name, not a sentence. Beyond this it is far more likely
 * to be an emphasised line of dialogue, and a wrong entry in a table of contents
 * costs more than a missing one.
 */
const IMPLICIT_MAX = 120;

const RULE = /^\s*(?:-{3,}|\*{3,})\s*$/;
const HEADING = /^\s*(#{1,3})\s+([\s\S]*)$/;
/** A paragraph that is entirely one bold run, optionally italic as well. */
const WHOLE_BOLD = /^\s*_{0,2}\*\*([\s\S]+?)\*\*_{0,2}\s*$/;

export interface OutlineSection {
  /** Stable within one parse; used as a React key and a selection handle. */
  key: string;
  title: string;
  level: 2 | 3;
  /** True when the heading is a bold line rather than a `##` heading. */
  implicit: boolean;
  /**
   * Which top-level block this heading is, counting non-empty blocks only.
   * `toHTML` emits exactly one element per block, so this is also the index of
   * the heading's element among the editor's children - which is what lets a
   * jump land on the right paragraph without searching for its text.
   */
  blockIndex: number;
  /** UTF-16 offsets into the manuscript: the section's own span. */
  index: number;
  end: number;
  /**
   * The same span in RUNE offsets, which is the unit the assistant reports its
   * findings in (backend/internal/ai/thai). Both are carried rather than
   * converted on demand: a conversion is a scan of the whole manuscript, and
   * this is read on every keystroke.
   */
  runeStart: number;
  runeEnd: number;
  words: number;
}

/**
 * Code points, not UTF-16 units.
 *
 * The assistant counts in runes. For Thai and ASCII the two agree exactly; an
 * emoji is where they part, and a chapter with emoji in it must not shift every
 * finding one section to the left.
 */
export function runeLength(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) index += 1;
    count += 1;
  }
  return count;
}

/** The words of an inline parse, with every marker dropped. */
function plainText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return node.text;
        case "image":
          return node.alt;
        default:
          return plainText(node.children);
      }
    })
    .join("");
}

interface Head {
  title: string;
  level: 2 | 3;
  implicit: boolean;
}

/** Whether one block is a heading, given what came before it. */
function headOf(chunk: string, afterRule: boolean, opening: boolean): Head | null {
  const explicit = HEADING.exec(chunk);
  if (explicit) {
    const title = plainText(parseInline(explicit[2].replace(/\n/g, " "))).trim();
    if (title === "") return null;
    return { title, level: explicit[1].length >= 3 ? 3 : 2, implicit: false };
  }

  if (!afterRule && !opening) return null;
  if (chunk.includes("\n")) return null;
  const bold = WHOLE_BOLD.exec(chunk);
  if (!bold || bold[1].length > IMPLICIT_MAX) return null;
  const title = plainText(parseInline(bold[1])).trim();
  return title === "" ? null : { title, level: 2, implicit: true };
}

/**
 * Reads a manuscript's sections.
 *
 * Sections TILE the document: everything before the first heading becomes its
 * own entry, so the per-section word counts add up to the chapter's own total
 * and a writer can trust both numbers at once.
 *
 * Returns an empty list for a chapter with no headings at all - a chapter that
 * is one continuous scene has no table of contents, and inventing one out of
 * paragraph numbers would be noise.
 */
export function outlineOf(content: string): OutlineSection[] {
  const heads: Array<Head & { blockIndex: number; index: number; runeStart: number }> = [];

  // The separators are captured so offsets stay exact; a block's own index in
  // the manuscript is what a jump and a finding are both measured against.
  const parts = content.split(/(\n{2,})/);
  let index = 0;
  let rune = 0;
  let blockIndex = 0;
  let afterRule = false;
  let opened = false;

  for (let part = 0; part < parts.length; part += 1) {
    const piece = parts[part];
    const isSeparator = part % 2 === 1;

    if (!isSeparator && piece.trim() !== "") {
      const head = headOf(piece, afterRule, !opened);
      if (head) heads.push({ ...head, blockIndex, index, runeStart: rune });
      afterRule = RULE.test(piece) && !piece.includes("\n");
      opened = true;
      blockIndex += 1;
    }

    index += piece.length;
    rune += runeLength(piece);
  }

  if (heads.length === 0) return [];

  const sections: OutlineSection[] = [];
  const push = (
    title: string,
    level: 2 | 3,
    implicit: boolean,
    blockAt: number,
    from: number,
    fromRune: number,
    to: number,
    toRune: number,
  ) => {
    sections.push({
      key: `${blockAt}:${title}`,
      title,
      level,
      implicit,
      blockIndex: blockAt,
      index: from,
      end: to,
      runeStart: fromRune,
      runeEnd: toRune,
      words: wordsIn(content.slice(from, to)),
    });
  };

  // Whatever opens the chapter before its first heading is a section too, or
  // its words would vanish from a count the writer is meant to trust. A
  // separator alone is not an opening, though: a row reading "ก่อนหัวข้อแรก ·
  // 0 คำ" is a line of the table of contents spent on nothing.
  if (heads[0].index > 0 && wordsIn(content.slice(0, heads[0].index)) > 0) {
    push("ก่อนหัวข้อแรก", 2, true, 0, 0, 0, heads[0].index, heads[0].runeStart);
  }

  heads.forEach((head, at) => {
    const next = heads[at + 1];
    push(
      head.title,
      head.level,
      head.implicit,
      head.blockIndex,
      head.index,
      head.runeStart,
      next ? next.index : content.length,
      next ? next.runeStart : rune,
    );
  });

  return sections;
}

/** Which section a rune offset falls in, or -1 when it falls in none. */
export function sectionAtRune(sections: OutlineSection[], rune: number): number {
  if (rune < 0) return -1;
  for (let at = sections.length - 1; at >= 0; at -= 1) {
    if (rune >= sections[at].runeStart) return rune < sections[at].runeEnd ? at : -1;
  }
  return -1;
}

/** The same, for a UTF-16 index - what a plain `indexOf` produces. */
export function sectionAtIndex(sections: OutlineSection[], index: number): number {
  if (index < 0) return -1;
  for (let at = sections.length - 1; at >= 0; at -= 1) {
    if (index >= sections[at].index) return index < sections[at].end ? at : -1;
  }
  return -1;
}

/** The chapter's own total, from the same pass that produced the sections. */
export function totalWords(sections: OutlineSection[], content: string): number {
  if (sections.length === 0) return wordsIn(content);
  return sections.reduce((sum, section) => sum + section.words, 0);
}
