/**
 * The bridge between the stored manuscript and what a writer edits
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13N).
 *
 * The editor is WYSIWYG: bold looks bold while it is being typed, not
 * `**bold**`. That is a presentation decision and it changes NOTHING about what
 * is stored - `chapters.content` is still the marked-up TEXT §13N defined, so
 * there is still no HTML on the write path, still nothing to sanitize, and a
 * manuscript is still readable with its markers if every renderer disappears.
 *
 * Two total functions make that safe:
 *
 *   toHTML   markdown -> the DOM the writer edits. Runs once, when the editor
 *            opens or the text is replaced from outside - never on a keystroke,
 *            because re-rendering under a caret would move it.
 *
 *   fromDOM  the edited DOM -> markdown, on every input. It is TOTAL: an element
 *            it does not recognise serialises its children rather than being
 *            dropped. The worst case is formatting the serializer did not know
 *            about; text a writer typed cannot go missing, which is the only
 *            failure that would actually matter.
 */

import {
  MARK_COLOURS,
  TEXT_COLOURS,
  clampWidth,
  isOwnImage,
  parseBlocks,
  parseInline,
  safeHref,
  safeImageSrc,
  type Align,
  type Inline,
} from "@/lib/markup";
import { INDENT } from "@/lib/markup-edit";

// ---------------------------------------------------------------------------
// markdown -> DOM
// ---------------------------------------------------------------------------

/** HTML-escapes a text leaf. The editor's DOM is built from strings. */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Suppresses the CSS first-line indent on a paragraph that already carries one
 * as CHARACTERS.
 *
 * ย่อหน้าอัตโนมัติ used to type two ideographic spaces into the manuscript. It
 * is a display rule now (§13Q), which is what makes it survive a paste and
 * impossible to delete by accident - but the chapters written under the old
 * behaviour still have those spaces in them, and they are the author's text.
 * They are not removed; the CSS indent stands down in front of them, so an old
 * paragraph looks exactly as it always did.
 */
function legacyIndentClass(text: string): string {
  return text.startsWith(INDENT) ? ' class="ft-typed-indent"' : "";
}

function alignStyle(align: Align): string {
  if (align === "center") return ' style="text-align:center"';
  if (align === "end") return ' style="text-align:right"';
  return "";
}

function inlineHTML(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "strong":
          return `<b>${inlineHTML(node.children)}</b>`;
        case "em":
          return `<i>${inlineHTML(node.children)}</i>`;
        case "underline":
          return `<u>${inlineHTML(node.children)}</u>`;
        case "strike":
          return `<s>${inlineHTML(node.children)}</s>`;
        case "sub":
          return `<sub>${inlineHTML(node.children)}</sub>`;
        case "sup":
          return `<sup>${inlineHTML(node.children)}</sup>`;
        case "colour":
          return `<span class="ft-${node.name}">${inlineHTML(node.children)}</span>`;
        case "mark":
          return `<mark class="ft-mark-${node.name}">${inlineHTML(node.children)}</mark>`;
        case "image": {
          const src = safeImageSrc(node.src);
          if (!src) return escape(node.alt);
          // A remote host is told nothing about which chapter is open. The
          // editor loads the picture so the writer can see what they pasted;
          // the referrer is the part that had to be withheld, not the image.
          const referrer = isOwnImage(src) ? "" : ' referrerpolicy="no-referrer"';
          // The author's chosen width, as the style the serializer reads back.
          const width = node.width ? ` style="width:${node.width}%"` : "";
          return `<img src="${escape(src)}" alt="${escape(node.alt)}"${referrer}${width}>`;
        }
        case "link": {
          const href = safeHref(node.href);
          if (!href) return inlineHTML(node.children);
          return `<a href="${escape(href)}">${inlineHTML(node.children)}</a>`;
        }
        default:
          // Single newlines inside one block are the author's line breaks. The
          // editor is not `pre-wrap`, so they become the <br> a browser edits.
          return escape(node.text).replace(/\n/g, "<br>");
      }
    })
    .join("");
}

/** Builds the editable document for a manuscript. */
export function toHTML(markdown: string): string {
  const blocks = parseBlocks(markdown);
  if (blocks.length === 0) return "<p><br></p>";

  return blocks
    .map((block) => {
      switch (block.kind) {
        case "rule":
          return "<hr>";
        case "heading":
          return `<h${block.level}${alignStyle(block.align)}>${inlineHTML(
            parseInline(block.text),
          )}</h${block.level}>`;
        case "quote":
          return `<blockquote>${inlineHTML(parseInline(block.text))}</blockquote>`;
        case "list": {
          const items = block.items
            .map((item) => `<li>${inlineHTML(parseInline(item))}</li>`)
            .join("");
          return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
        }
        default: {
          const html = inlineHTML(parseInline(block.text));
          // An empty paragraph still needs a line box, or the caret cannot be
          // placed in it.
          return `<p${legacyIndentClass(block.text)}${alignStyle(block.align)}>${
            html || "<br>"
          }</p>`;
        }
      }
    })
    .join("");
}

// ---------------------------------------------------------------------------
// DOM -> markdown
// ---------------------------------------------------------------------------

const TEXT_COLOUR_CLASSES = new Map<string, string>(
  TEXT_COLOURS.map((name) => [`ft-${name}`, name]),
);
const MARK_COLOUR_CLASSES = new Map<string, string>(
  MARK_COLOURS.map((name) => [`ft-mark-${name}`, name]),
);

/** Block-level tags, so the serializer knows where a paragraph break belongs. */
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "HR",
  "PRE",
]);

/**
 * Wraps a run of text in a marker, but only when there is something to wrap.
 *
 * Browsers happily produce `<b></b>` around nothing when a writer presses bold
 * on an empty selection, and `****` in a manuscript is a typo the platform
 * would have written for them.
 */
function wrap(inner: string, marker: string): string {
  if (inner.trim() === "") return inner;
  // Markers go INSIDE the surrounding whitespace: " **bold** " reads, but
  // "** bold **" does not parse back as bold at all.
  const [, lead, body, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? ["", "", inner, ""];
  return `${lead}${marker}${body}${marker}${tail}`;
}

function classColour(element: Element): { colour?: string; mark?: string } {
  for (const name of Array.from(element.classList)) {
    const colour = TEXT_COLOUR_CLASSES.get(name);
    if (colour) return { colour };
    const mark = MARK_COLOUR_CLASSES.get(name);
    if (mark) return { mark };
  }
  return {};
}

/**
 * The marker each inline tag writes.
 *
 * Italic is `_`, not `*`, and that is load-bearing rather than a style choice.
 * A run that is bold AND italic nests, and `**` wrapped around `*x*` produces
 * `***x***` - which the parser reads as `**` opening, `*x` inside, and a
 * leftover asterisk, so the author sees stray asterisks in their own sentence.
 * `**` around `_x_` has no such collision, and `_` around `**x**` has none
 * either, so the pair round-trips whichever way the browser happened to nest it.
 */
const INLINE_MARKERS: Record<string, string> = {
  B: "**",
  STRONG: "**",
  I: "_",
  EM: "_",
  U: "__",
  S: "~~",
  STRIKE: "~~",
  DEL: "~~",
  SUB: "~",
  SUP: "^",
};

/**
 * Reads formatting a pasted span carries as inline style rather than as tags.
 *
 * Only the four the vocabulary already has. Anything else the site of origin
 * decided - a font family, a pixel size, a hex colour - is deliberately dropped:
 * the closed palette exists so a manuscript stays legible in both themes
 * (§13N), and honouring a pasted `color: #f0f0f0` would be the one way to get a
 * chapter that is invisible in the theme its author never opened.
 */
function styledText(element: Element, inner: string, active: ReadonlySet<string>): string {
  const style = (element as HTMLElement).style;
  if (!style || inner.trim() === "") return inner;

  const weight = style.fontWeight;
  const decoration = style.textDecorationLine || style.textDecoration || "";

  // Innermost first: each wrap goes around the last, so the ORDER here is the
  // nesting order, and bold ends up outermost - the same shape `<b><i>` gives.
  const markers: string[] = [];
  if (decoration.includes("line-through")) markers.push("~~");
  if (decoration.includes("underline")) markers.push("__");
  if (style.fontStyle === "italic" || style.fontStyle === "oblique") markers.push("_");
  if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) {
    markers.push("**");
  }

  let text = inner;
  for (const marker of markers) {
    if (!active.has(marker)) text = wrap(text, marker);
  }
  return text;
}

/**
 * Serializes the inline content of one element.
 *
 * `active` carries the markers already open above this node. A browser will
 * happily produce `<sup><sup>x</sup></sup>` when the button is pressed twice on
 * a collapsed caret, and writing that out as `^^x^^` would hand the author a
 * manuscript with visible carets in it. A second one of the same kind adds
 * nothing, so it writes nothing.
 */
function inlineText(node: Node, active: ReadonlySet<string> = new Set()): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // A manuscript keeps the author's own characters; the only thing normalised
    // is the non-breaking space a contenteditable inserts to hold a line open.
    return (node.nodeValue ?? "").replace(/ /g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  const marker = INLINE_MARKERS[element.tagName];
  const inside = marker && !active.has(marker) ? new Set([...active, marker]) : active;
  const inner = Array.from(element.childNodes)
    .map((child) => inlineText(child, inside))
    .join("");

  if (marker) {
    return active.has(marker) ? inner : wrap(inner, marker);
  }

  switch (element.tagName) {
    case "BR":
      return "\n";
    case "MARK": {
      const { mark } = classColour(element);
      return inner.trim() === "" ? inner : `{bg-${mark ?? "yellow"}|${inner}}`;
    }
    case "IMG": {
      const image = element as HTMLImageElement;
      const src = image.getAttribute("src") ?? "";
      const alt = image.getAttribute("alt") ?? "";
      if (!safeImageSrc(src)) return alt;
      // A percentage width the writer set with the size buttons. Anything else
      // the browser may have put there - a pixel width from a paste, `auto` -
      // is not a size the author chose, so it is not carried into the text.
      const raw = image.style?.width ?? "";
      const width = raw.endsWith("%") ? clampWidth(Number.parseFloat(raw)) : undefined;
      return width ? `![${alt}](${src} =${width}%)` : `![${alt}](${src})`;
    }
    case "A": {
      const href = safeHref(element.getAttribute("href") ?? "");
      return href ? `[${inner}](${href})` : inner;
    }
    case "SPAN":
    case "FONT": {
      const { colour, mark } = classColour(element);
      if (colour) return inner.trim() === "" ? inner : `{${colour}|${inner}}`;
      if (mark) return inner.trim() === "" ? inner : `{bg-${mark}|${inner}}`;
      // Text pasted from another site carries its formatting as inline STYLE,
      // not as tags. Reading it here is what stops a bold-italic sentence
      // arriving as flat prose - the author formatted it once already.
      return styledText(element, inner, active);
    }
    default:
      // Anything else contributes its text and nothing more. This is the branch
      // that makes the serializer total: an element it has never heard of costs
      // its formatting, never its words.
      return inner;
  }
}

function alignPrefix(element: Element): string {
  const align = (element as HTMLElement).style?.textAlign;
  if (align === "center") return ":center: ";
  if (align === "right" || align === "end") return ":right: ";
  return "";
}

/** Applies a per-line prefix to every line of a block. */
function prefixLines(text: string, prefix: string): string {
  if (prefix === "") return text;
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? line : prefix + line))
    .join("\n");
}

function blockText(element: Element): string[] {
  const align = alignPrefix(element);

  switch (element.tagName) {
    case "HR":
      return ["---"];

    case "H1":
    case "H2":
      return [prefixLines(`## ${inlineText(element)}`, align)];
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return [prefixLines(`### ${inlineText(element)}`, align)];

    case "BLOCKQUOTE": {
      // A blockquote may hold paragraphs; each of their lines is quoted.
      const inner = serializeChildren(element);
      return [
        inner
          .split("\n")
          .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
          .join("\n"),
      ];
    }

    case "UL":
    case "OL": {
      const ordered = element.tagName === "OL";
      const items = Array.from(element.children).filter(
        (child) => child.tagName === "LI",
      );
      if (items.length === 0) return [];
      return [
        items
          .map((item, index) => {
            const marker = ordered ? `${index + 1}. ` : "- ";
            // A wrapped item keeps its own indentation rather than starting a
            // new bullet on the next line.
            return marker + inlineText(item).split("\n").join("\n  ");
          })
          .join("\n"),
      ];
    }

    default:
      return [prefixLines(inlineText(element), align)];
  }
}

function serializeChildren(root: Element): string {
  const blocks: string[] = [];
  let loose: string[] = [];

  const flush = () => {
    if (loose.length === 0) return;
    const text = loose.join("");
    if (text.trim() !== "") blocks.push(text);
    loose = [];
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((child as Element).tagName)) {
      flush();
      blocks.push(...blockText(child as Element));
      continue;
    }
    // Bare text or an inline element directly under the root: browsers produce
    // this while a writer is typing the first line of an empty document.
    loose.push(inlineText(child));
  }
  flush();

  return blocks.join("\n\n");
}

/**
 * Serializes an edited document back to a manuscript.
 *
 * Trailing empty blocks are trimmed rather than stored: a contenteditable keeps
 * a spare paragraph at the end so there is somewhere to click, and that is a
 * property of the editor, not of the author's work.
 */
export function fromDOM(root: HTMLElement): string {
  return serializeChildren(root).replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}
