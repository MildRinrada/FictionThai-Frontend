/**
 * The restricted markup a chapter may be written in
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13N, answering docs/CONTENT-MODEL.md §3).
 *
 * `docs/11 §17` asks for "an allowed content model instead of allowing arbitrary
 * HTML", and `docs/13 §38` for a pipeline that ends in safe rendering. This is
 * that content model, and the shape it takes matters more than the syntax:
 *
 *   * **The stored value is text.** There is no HTML anywhere in the pipeline,
 *     so there is nothing to sanitize and no sanitizer to keep trusting. The
 *     renderer builds React elements from this parse; nothing ever reaches
 *     `dangerouslySetInnerHTML`. A chapter cannot carry script no matter what is
 *     stored - the property the platform has had since day one, kept.
 *
 *   * **It is a strict superset of plain text**, which is what lets a chapter
 *     move onto it without a destructive migration (CONTENT-MODEL §3), and what
 *     lets a writer read their own manuscript with the markers still in it.
 *
 *   * **The vocabulary is closed and small**, exactly `docs/04 §8`'s MVP list -
 *     bold, italic, lists, quotes, links, basic formatting - plus the headings
 *     and separators `docs/01 §18` names. Not a word processor.
 *
 * A chunk separated by a blank line is exactly ONE block. That is a deliberate
 * constraint rather than an accident of the parser: it keeps a block index equal
 * to the paragraph index `content.split(/\n{2,}/)` already produces, which is
 * what 12G's paragraph-anchored comments anchor on.
 */

/** Where a block sits on the measure. "start" is the default and unmarked. */
export type Align = "start" | "center" | "end";

export type Block =
  | { kind: "paragraph"; text: string; align: Align }
  | { kind: "heading"; level: 2 | 3; text: string; align: Align }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "rule" };

/** A separator line, as the toolbar writes it. */
const RULE = /^\s*(?:-{3,}|\*{3,})\s*$/;
const HEADING = /^\s*(#{1,3})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Alignment, as a per-line prefix (§13N).
 *
 * A prefix rather than a fenced block, so it works through the same machinery
 * every other line style uses and reads as itself in the raw manuscript. Left
 * is the default and carries NO marker: the commonest case costs nothing.
 */
const ALIGN = /^\s*:(center|right):\s?(.*)$/;

function alignOf(line: string): Align {
  const match = ALIGN.exec(line);
  if (!match) return "start";
  return match[1] === "center" ? "center" : "end";
}

function stripAlign(line: string): string {
  const match = ALIGN.exec(line);
  return match ? match[2] : line;
}

/**
 * Splits a manuscript into blocks.
 *
 * Blank lines separate blocks; a block's KIND comes from its first line, so a
 * paragraph that happens to contain a line starting with "-" is still one
 * paragraph. Getting that wrong would silently restructure an author's prose,
 * which is the failure this whole design exists to avoid.
 */
export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];

  for (const chunk of content.split(/\n{2,}/)) {
    if (chunk.trim() === "") {
      // A run of blank lines is spacing the author typed, not a block. It is
      // still preserved in the stored text.
      continue;
    }

    // Alignment is read from the first line and stripped from all of them, so a
    // centred paragraph is one block rather than one block per line.
    const align = alignOf(chunk.split("\n")[0]);
    const lines = chunk.split("\n").map(stripAlign);
    const first = lines[0];

    if (RULE.test(first) && lines.length === 1) {
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = HEADING.exec(first);
    if (heading) {
      // Two levels, not three: a chapter is already a heading in the page, and
      // an h1 inside its body would compete with it. `#` and `##` both land on
      // the larger of the two so a writer who types either gets what they meant.
      blocks.push({
        kind: "heading",
        level: heading[1].length >= 3 ? 3 : 2,
        text: [heading[2], ...lines.slice(1)].join("\n").trim(),
        align,
      });
      continue;
    }

    if (QUOTE.test(first)) {
      blocks.push({
        kind: "quote",
        text: lines
          .map((line) => {
            const match = QUOTE.exec(line);
            return match ? match[1] : line;
          })
          .join("\n"),
      });
      continue;
    }

    const ordered = ORDERED.test(first);
    if (ordered || BULLET.test(first)) {
      const pattern = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      for (const line of lines) {
        const match = pattern.exec(line);
        if (match) {
          items.push(match[1]);
        } else if (items.length > 0) {
          // A wrapped line belongs to the item above it rather than becoming an
          // empty bullet of its own.
          items[items.length - 1] += `\n${line.trim()}`;
        }
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    blocks.push({ kind: "paragraph", text: lines.join("\n"), align });
  }

  return blocks;
}

/**
 * The manuscript colour names (§13N).
 *
 * A CLOSED set, resolved to CSS classes that are defined for BOTH themes. A
 * writer picks a meaning, not a hex value - which is what stops a manuscript
 * from being unreadable in a theme its author never opened (docs/05 §6).
 */
export const TEXT_COLOURS = [
  "red",
  "orange",
  "green",
  "blue",
  "purple",
  "grey",
] as const;
export type TextColour = (typeof TEXT_COLOURS)[number];

export const MARK_COLOURS = ["yellow", "green", "blue", "pink"] as const;
export type MarkColour = (typeof MARK_COLOURS)[number];

/** The default a bare `==highlight==` takes. */
export const DEFAULT_MARK: MarkColour = "yellow";

/** One inline span of a block. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "underline"; children: Inline[] }
  | { kind: "strike"; children: Inline[] }
  | { kind: "sub"; children: Inline[] }
  | { kind: "sup"; children: Inline[] }
  | { kind: "colour"; name: TextColour; children: Inline[] }
  | { kind: "mark"; name: MarkColour; children: Inline[] }
  | { kind: "image"; src: string; alt: string; width?: number }
  | { kind: "link"; href: string; children: Inline[] };

/**
 * The inline vocabulary, tried in this order at each position.
 *
 * Bold before italic, because `**x**` also begins with a single `*` and the
 * writer meant the pair. Every pattern refuses a newline, so an unmatched
 * marker cannot swallow the rest of a manuscript - it just stays visible, which
 * is the honest failure for text an author typed.
 */
const INLINE_RULES: Array<{
  pattern: RegExp;
  /** null means "not actually this rule" - the text stays literal. */
  build: (match: RegExpExecArray) => Inline | null;
}> = [
  // Image before link: `![alt](src)` also contains `[alt](src)`.
  //
  // The optional ` =60%` is the author's chosen WIDTH (§13S). A percentage
  // rather than pixels, because the measure a chapter is read at is the
  // reader's setting, not the writer's screen - "half the column" survives a
  // phone and a desktop; "400px" is right on exactly one of them.
  {
    pattern: /!\[([^\]\n]*)\]\(([^()\s]+)(?:\s+=(\d{1,3})%)?\)/,
    build: (match) => ({
      kind: "image",
      src: match[2],
      alt: match[1],
      width: match[3] ? clampWidth(Number(match[3])) : undefined,
    }),
  },
  {
    pattern: /\[([^\]\n]+)\]\(([^()\s]+)\)/,
    build: (match) => ({
      kind: "link",
      href: match[2],
      children: parseInline(match[1]),
    }),
  },
  // Colour and highlight share one construct: `{name|text}`. An unknown name is
  // not a colour and not an error - it is text an author typed, kept as typed.
  {
    pattern: /\{([a-z-]+)\|([^{}\n]+)\}/,
    build: (match) => {
      const name = match[1];
      const body = parseInline(match[2]);
      if ((TEXT_COLOURS as readonly string[]).includes(name)) {
        return { kind: "colour", name: name as TextColour, children: body };
      }
      const mark = name.startsWith("bg-") ? name.slice(3) : "";
      if ((MARK_COLOURS as readonly string[]).includes(mark)) {
        return { kind: "mark", name: mark as MarkColour, children: body };
      }
      return null;
    },
  },
  // Bold AND italic at once, before either alone.
  //
  // The serializer writes this pair as `**_x_**` precisely so it does not have
  // to exist - but text pasted from elsewhere, and every chapter saved while the
  // editor still emitted `***x***`, uses the three-asterisk form. Without a rule
  // for it the `**` rule matches first, takes `***x**` as its whole span, and
  // leaves the odd asterisks visible in the middle of an author's sentence.
  {
    pattern: /\*\*\*([^\n]+?)\*\*\*/,
    build: (match) => ({
      kind: "strong",
      children: [{ kind: "em", children: parseInline(match[1]) }],
    }),
  },
  {
    pattern: /\*\*([^\n]+?)\*\*/,
    build: (match) => ({ kind: "strong", children: parseInline(match[1]) }),
  },
  // Underline before italic: `__x__` also opens with a single `_`.
  {
    pattern: /__([^\n]+?)__/,
    build: (match) => ({ kind: "underline", children: parseInline(match[1]) }),
  },
  // Strikethrough before subscript, for the same reason.
  {
    pattern: /~~([^\n]+?)~~/,
    build: (match) => ({ kind: "strike", children: parseInline(match[1]) }),
  },
  {
    pattern: /==([^\n]+?)==/,
    build: (match) => ({
      kind: "mark",
      name: DEFAULT_MARK,
      children: parseInline(match[1]),
    }),
  },
  {
    pattern: /\^([^^\n]+?)\^/,
    build: (match) => ({ kind: "sup", children: parseInline(match[1]) }),
  },
  {
    pattern: /~([^~\n]+?)~/,
    build: (match) => ({ kind: "sub", children: parseInline(match[1]) }),
  },
  {
    pattern: /(?:\*([^*\n]+?)\*|_([^_\n]+?)_)/,
    build: (match) => ({
      kind: "em",
      children: parseInline(match[1] ?? match[2]),
    }),
  },
];

/**
 * The widths an image may take, as a percentage of the reading column.
 *
 * A closed range rather than any number: 10% is a thumbnail nobody meant, and
 * anything over 100 would break out of the measure the reader chose.
 */
export const MIN_IMAGE_WIDTH = 20;
export const MAX_IMAGE_WIDTH = 100;

/** The sizes the toolbar offers. Full width is the default and unmarked. */
export const IMAGE_WIDTHS = [25, 50, 75, 100] as const;

export function clampWidth(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded >= MAX_IMAGE_WIDTH) return undefined;
  return Math.max(MIN_IMAGE_WIDTH, rounded);
}

/** Parses one block's text into inline spans. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;

  while (rest !== "") {
    // Every rule that matches, earliest first. On a tie the rule listed first
    // wins, which is what puts `**` ahead of `*` and `![` ahead of `[`.
    const candidates = INLINE_RULES.map((rule) => ({
      rule,
      match: rule.pattern.exec(rest),
    }))
      .filter(
        (candidate): candidate is { rule: (typeof INLINE_RULES)[number]; match: RegExpExecArray } =>
          candidate.match !== null,
      )
      .sort((a, b) => a.match.index - b.match.index);

    let taken: { index: number; length: number; node: Inline } | null = null;
    for (const candidate of candidates) {
      // A rule may look at what it matched and decline - an unknown colour name
      // is text the author typed, not an error and not a colour.
      const node = candidate.rule.build(candidate.match);
      if (node) {
        taken = { index: candidate.match.index, length: candidate.match[0].length, node };
        break;
      }
    }

    if (!taken) {
      out.push({ kind: "text", text: rest });
      break;
    }

    if (taken.index > 0) {
      out.push({ kind: "text", text: rest.slice(0, taken.index) });
    }
    out.push(taken.node);
    rest = rest.slice(taken.index + taken.length);
  }

  return out;
}

/**
 * Whether a link may be rendered as a link.
 *
 * docs/13 §38 lists malicious URLs beside XSS, and the vector is the SCHEME:
 * `javascript:` and `data:` both execute from an ordinary-looking anchor. An
 * allowlist rather than a blocklist, because a blocklist is a list of the
 * schemes somebody has thought of so far.
 *
 * A refused URL is not an error and never removes the author's words - the link
 * text renders as plain text, which is exactly what it says.
 */
export function safeHref(href: string): string | null {
  const value = href.trim();
  if (value === "") return null;
  // Site-relative, which is how a writer links to another fiction here.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  return null;
}

/**
 * Whether an image may be loaded.
 *
 * The SCHEME is the part that has to be checked, and for the same reason a link
 * is checked: `javascript:` and `data:` both execute from an ordinary-looking
 * attribute. Everything the allowlist admits is inert.
 *
 * It used to admit our own `/media/` route and nothing else, on the grounds
 * that a remote image hands the reader's IP to a host they never chose. That
 * restriction cost more than it bought: a writer moving their fiction here
 * pastes chapters whose pictures live on the site they came from, and every one
 * of them silently became its alt text. Remote images are allowed, and the
 * renderer sends `referrerpolicy="no-referrer"` with them so the third party
 * learns nothing about WHICH chapter is being read.
 *
 * A refused source still renders its alt text, which is the author's own words.
 */
export function safeImageSrc(src: string): string | null {
  const value = src.trim();
  if (value === "") return null;
  // Site-relative, which is what our own media route returns.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  return null;
}

/**
 * Whether an image is served by us.
 *
 * Only the renderer's `referrerpolicy` and `loading` decisions depend on this -
 * an image we host has nothing to learn from a referrer it already knows.
 */
export function isOwnImage(src: string): boolean {
  const value = src.trim();
  if (value.startsWith("/media/")) return true;
  return /^https?:\/\/[^\s/]+\/media\/[^\s]+$/i.test(value);
}
