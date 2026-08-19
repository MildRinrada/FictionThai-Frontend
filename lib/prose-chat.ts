/**
 * อ่านแบบแชท - reading prose as a conversation
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13O).
 *
 * A **ฟิคล้วน** fiction is written as prose and stored as prose. This derives a
 * chat view of it AT READ TIME, from the quotation marks the author already
 * typed, so a reader who prefers the chat layout can have it without the writer
 * maintaining a second version.
 *
 * Three rules make that safe to offer at all:
 *
 *   1. **It never writes.** Nothing here touches `chapters.content` and nothing
 *      is ever saved into `chapter_messages`. `docs/CONTENT-MODEL.md` is
 *      explicit that presentation selects what a reader SEES and never rewrites
 *      what exists; a derived view that stored itself would be exactly the
 *      destructive conversion CLAUDE.md rules 13 and 14 forbid.
 *
 *   2. **It is off by default and reversible.** The prose is what the author
 *      published; this is a reader's choice, taken one URL at a time.
 *
 *   3. **It invents nothing.** It does not guess speaker NAMES - there is no
 *      way to know them without the Thai NLP work of docs/12, and a wrong name
 *      on someone's dialogue is worse than no name. Everything outside the
 *      quotation marks stays visible as narration, in the author's order.
 *
 * The one presentational guess is which SIDE a bubble sits on, and it is a
 * guess the UI labels: consecutive utterances alternate, which is how a
 * two-hander reads. It is a layout convention, not a claim about who spoke.
 */

import { parseBlocks, parseInline, type Inline } from "@/lib/markup";

/** One derived turn of the conversation. */
export interface DerivedTurn {
  /**
   * `marker` is a section heading - the standalone bold character-name line
   * Thai fanfiction separates its sections with - and `separator` is the
   * author's own `---` rule. Both render as the grey status rows a chat app
   * uses for dates and scene changes (reader review 2026-08), never as
   * anybody's bubble.
   */
  kind: "speech" | "narration" | "marker" | "separator";
  text: string;
  /** Only meaningful for speech. */
  side: "left" | "right";
}

/**
 * The manuscript as bare words: markers dropped, images gone, blocks joined
 * by blank lines. The derived chat renders PLAIN text, so deriving from the
 * raw manuscript leaked `**`, `---`, and `![..](..)` into the bubbles - the
 * reader was shown the markup instead of the story. Nothing here writes;
 * it is a projection for one view, same as the derivation itself.
 */
export function plainProse(content: string): string {
  return parseBlocks(content)
    .map(blockWords)
    .filter((text) => text.trim() !== "")
    .join("\n\n");
}

/** One block's bare words. Rules carry none; a list keeps its lines. */
function blockWords(block: ReturnType<typeof parseBlocks>[number]): string {
  switch (block.kind) {
    case "rule":
      return "";
    case "list":
      return block.items.map((item) => plainText(parseInline(item))).join("\n");
    default:
      return plainText(parseInline(block.text));
  }
}

/** The words of an inline parse. Pictures are dropped - a banner is not prose. */
function plainText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return node.text;
        case "image":
          return "";
        default:
          return plainText(node.children);
      }
    })
    .join("");
}

/**
 * The quotation marks this recognises.
 *
 * Straight and smart, because a manuscript typed on a phone keyboard and one
 * typed in a word processor are the same manuscript, and a reader should not
 * have to know which. Japanese-style corner brackets are here too: Thai
 * fanfiction borrows them constantly.
 *
 * A pair whose opener and closer are the SAME character (the straight `"`)
 * alternates instead of nesting - which is what a typewriter quote does.
 */
const PAIRS: Array<{ open: string; close: string }> = [
  { open: '"', close: '"' },
  // ฟันหนูอันเดียว, paired (reader review 2026-08): the second of the two
  // quote shapes the product names - a straight apostrophe used as a
  // quotation mark, closed by the next one. Like the straight double quote
  // it alternates rather than nesting; an unpaired one (a possessive, a
  // contraction with no second mark) falls through to narration below.
  { open: "'", close: "'" },
  { open: "“", close: "”" }, // “ ”
  { open: "‘", close: "’" }, // ‘ ’
  { open: "«", close: "»" }, // « »
  { open: "「", close: "」" }, // 「 」
  { open: "『", close: "』" }, // 『 』
];

const OPENERS = new Map(PAIRS.map((pair) => [pair.open, pair.close]));

/**
 * Whether a manuscript has any dialogue to derive a chat from.
 *
 * Used to decide whether to OFFER the mode at all: a chapter of pure narration
 * would derive one long narration block, and a switch that visibly does nothing
 * is worse than a switch that is not there.
 */
export function hasDialogue(content: string): boolean {
  return derivedChat(content).some((turn) => turn.kind === "speech");
}

/** Derives the conversation from bare text. Pure, and never mutates its input. */
export function derivedChat(content: string): DerivedTurn[] {
  const turns: DerivedTurn[] = [];
  appendTurns(content, turns, "left");
  return turns;
}

/**
 * The same heading rule the editor's outline trusts (lib/outline.ts): a
 * whole-bold single line is a section marker only after a rule or at the
 * chapter's opening. `**ตูม!**` mid-scene is a shout, not a heading.
 */
const WHOLE_BOLD = /^\s*_{0,2}\*\*([\s\S]+?)\*\*_{0,2}\s*$/;
const MARKER_MAX = 120;

/**
 * Derives the conversation VIEW: the manuscript block by block, with the
 * author's structure kept - `---` rules become separators, heading lines
 * (the standalone character-name line) become markers, and the bubble
 * alternation flows across paragraphs as one conversation.
 */
export function derivedChatView(content: string): DerivedTurn[] {
  const turns: DerivedTurn[] = [];
  let side: "left" | "right" = "left";
  let afterRule = false;
  let opened = false;

  for (const block of parseBlocks(content)) {
    if (block.kind === "rule") {
      afterRule = true;
      turns.push({ kind: "separator", text: "", side: "left" });
      continue;
    }
    if (block.kind === "heading") {
      turns.push({
        kind: "marker",
        text: plainText(parseInline(block.text)).trim(),
        side: "left",
      });
      afterRule = false;
      opened = true;
      continue;
    }
    if (block.kind !== "list" && block.kind !== "quote" && (afterRule || !opened)) {
      const bold = WHOLE_BOLD.exec(block.text);
      if (bold && !block.text.includes("\n")) {
        const title = plainText(parseInline(bold[1])).trim();
        if (title !== "" && [...title].length <= MARKER_MAX) {
          turns.push({ kind: "marker", text: title, side: "left" });
          afterRule = false;
          opened = true;
          continue;
        }
      }
    }
    afterRule = false;
    opened = true;
    const words = blockWords(block);
    if (words.trim() !== "") side = appendTurns(words, turns, side);
  }
  return turns;
}

/** The quote-walk itself, shared by both derivations. Returns the next side. */
function appendTurns(
  content: string,
  turns: DerivedTurn[],
  side: "left" | "right",
): "left" | "right" {
  let narration = "";

  const flushNarration = () => {
    const text = narration.trim();
    narration = "";
    if (text !== "") turns.push({ kind: "narration", text, side: "left" });
  };

  let index = 0;
  while (index < content.length) {
    const character = content[index];
    const closer = OPENERS.get(character);

    if (closer === undefined) {
      narration += character;
      index += 1;
      continue;
    }

    const end = content.indexOf(closer, index + 1);
    if (end === -1) {
      // An unclosed quotation mark is a character the author typed, not a
      // command. It stays in the narration rather than swallowing the rest of
      // the chapter into one bubble.
      narration += character;
      index += 1;
      continue;
    }

    const speech = content.slice(index + 1, end).trim();
    if (speech === "") {
      // An empty pair is punctuation, not an utterance.
      narration += content.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    flushNarration();
    turns.push({ kind: "speech", text: speech, side });
    // Alternating is a LAYOUT convention for a two-hander, and the panel above
    // the conversation says so. Nothing here claims to know who spoke.
    side = side === "left" ? "right" : "left";
    index = end + 1;
  }

  flushNarration();
  return side;
}
