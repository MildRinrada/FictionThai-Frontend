import { Fragment } from "react";

import { renderWithSlots, type TokenSlot } from "@/components/reader/variable-text";
import {
  isOwnImage,
  parseBlocks,
  parseInline,
  safeHref,
  safeImageSrc,
  type Align,
  type Inline,
} from "@/lib/markup";
import { INDENT } from "@/lib/markup-edit";

/**
 * The safe renderer at the end of docs/11 §17's pipeline
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13N).
 *
 * A Server Component, like the plain renderer beside it: a formatted chapter
 * still ships no JavaScript (docs/07 §20).
 *
 * Every leaf is a React text node. There is no `dangerouslySetInnerHTML` here
 * and no HTML anywhere in the pipeline, so the parse cannot produce markup the
 * author did not ask for and stored text cannot carry script. That is the same
 * guarantee the plain-text model had; formatting did not spend it.
 *
 * Reader variables (§13H) resolve inside every text leaf, so a token inside a
 * bold span or a list item still becomes a slot.
 */

export function RichText({
  content,
  slots = [],
  className = "reading-surface",
}: {
  content: string;
  slots?: TokenSlot[];
  /**
   * Replaces `.reading-surface`. A headcanon entry's body is already inside
   * one, and nesting the class would apply the measure and the type scale a
   * second time.
   */
  className?: string;
}) {
  return (
    <div className={className}>
      {parseBlocks(content).map((block, index) => {
        switch (block.kind) {
          case "rule":
            return <hr key={index} className="my-8 border-reader-rule" />;

          case "heading":
            return block.level === 2 ? (
              <h2
                key={index}
                className={`mt-8 mb-3 font-serif text-[1.35em] font-semibold tracking-tight first:mt-0 ${alignClass(block.align)}`}
              >
                <Spans nodes={parseInline(block.text)} slots={slots} />
              </h2>
            ) : (
              <h3
                key={index}
                className={`mt-6 mb-2 font-serif text-[1.15em] font-semibold tracking-tight first:mt-0 ${alignClass(block.align)}`}
              >
                <Spans nodes={parseInline(block.text)} slots={slots} />
              </h3>
            );

          case "quote":
            return (
              <blockquote
                key={index}
                className="my-5 border-s-2 border-reader-rule ps-4 text-reader-muted italic"
              >
                <p>
                  <Spans nodes={parseInline(block.text)} slots={slots} />
                </p>
              </blockquote>
            );

          case "list": {
            const items = block.items.map((item, i) => (
              <li key={i} className="mb-1.5">
                <Spans nodes={parseInline(item)} slots={slots} />
              </li>
            ));
            return block.ordered ? (
              <ol key={index} className="mb-[1.15em] list-decimal ps-6">
                {items}
              </ol>
            ) : (
              <ul key={index} className="mb-[1.15em] list-disc ps-6">
                {items}
              </ul>
            );
          }

          default:
            // `.reading-surface p` carries `white-space: pre-wrap`, so the
            // author's own indentation and single line breaks survive - the
            // indent is content, not a CSS decision (docs/CONTENT-MODEL.md).
            return (
              <p
                key={index}
                className={`${indentClass(block.text)} ${alignClass(block.align)}`.trim()}
              >
                <Spans nodes={parseInline(block.text)} slots={slots} />
              </p>
            );
        }
      })}
    </div>
  );
}

/**
 * Stands the CSS first-line indent down in front of a typed one (§13Q).
 *
 * ย่อหน้าอัตโนมัติ is a display rule now, applied to every prose paragraph. The
 * chapters written while it typed two ideographic spaces into the manuscript
 * still have them, and those spaces are the author's text - so they are never
 * removed, and the paragraph that carries them opts out of the rule instead.
 */
function indentClass(text: string): string {
  return text.startsWith(INDENT) ? "ft-typed-indent" : "";
}

/** Left is the default and carries no class, so the commonest case is bare. */
function alignClass(align: Align): string {
  if (align === "center") return "text-center";
  if (align === "end") return "text-end";
  return "";
}

/** Renders one inline tree. Text leaves go through the variable slots. */
function Spans({ nodes, slots }: { nodes: Inline[]; slots: TokenSlot[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case "strong":
            return (
              <strong key={index} className="font-semibold">
                <Spans nodes={node.children} slots={slots} />
              </strong>
            );
          case "em":
            return (
              <em key={index}>
                <Spans nodes={node.children} slots={slots} />
              </em>
            );
          case "underline":
            return (
              <u key={index}>
                <Spans nodes={node.children} slots={slots} />
              </u>
            );
          case "strike":
            return (
              <s key={index}>
                <Spans nodes={node.children} slots={slots} />
              </s>
            );
          case "sub":
            return (
              <sub key={index}>
                <Spans nodes={node.children} slots={slots} />
              </sub>
            );
          case "sup":
            return (
              <sup key={index}>
                <Spans nodes={node.children} slots={slots} />
              </sup>
            );
          case "colour":
            // A class from a CLOSED set, never a style attribute built from
            // manuscript text. The palette is defined for both themes, so a
            // colour an author chose on parchment is still legible in the dark
            // one they never opened (docs/05 §6).
            return (
              <span key={index} className={`ft-${node.name}`}>
                <Spans nodes={node.children} slots={slots} />
              </span>
            );
          case "mark":
            return (
              <mark key={index} className={`ft-mark-${node.name}`}>
                <Spans nodes={node.children} slots={slots} />
              </mark>
            );
          case "image": {
            const src = safeImageSrc(node.src);
            // A refused source keeps the author's alt text rather than leaving
            // a hole, and never loads from a host the reader did not choose.
            if (!src) return <Fragment key={index}>{node.alt}</Fragment>;
            return (
              /* eslint-disable-next-line @next/next/no-img-element -- an
                 immutable URL, with dimensions we do not store; next/image
                 would add a proxy hop and a layout guess. */
              <img
                key={index}
                src={src}
                alt={node.alt}
                loading="lazy"
                /* A host that is not ours is told nothing about WHICH page is
                   open. It still sees a request - that is what loading an image
                   from elsewhere is - but not what is being read. */
                referrerPolicy={isOwnImage(src) ? undefined : "no-referrer"}
                /* The author's chosen width, as a share of the reading column
                   (§13S). A percentage rather than pixels, so "half the
                   column" is still half a column on a phone. */
                style={node.width ? { width: `${node.width}%` } : undefined}
                /* inline-block, not block: the alignment a writer chose lives
                   on the paragraph as `text-align`, and a block-level image
                   ignores it. */
                className={`my-4 inline-block rounded-md ${
                  node.width ? "h-auto" : "max-h-128 w-auto"
                }`}
              />
            );
          }
          case "link": {
            const href = safeHref(node.href);
            // A refused scheme keeps the author's words and drops only the
            // link - nothing an author typed is ever deleted by this renderer.
            if (!href) {
              return <Spans key={index} nodes={node.children} slots={slots} />;
            }
            return (
              <a
                key={index}
                href={href}
                // A link in a manuscript is a reader-supplied destination, so it
                // gets no window handle back and no ranking from us
                // (docs/13 §38).
                rel="nofollow noopener noreferrer"
                target={href.startsWith("/") ? undefined : "_blank"}
                className="text-primary underline underline-offset-2"
              >
                <Spans nodes={node.children} slots={slots} />
              </a>
            );
          }
          default:
            // A Fragment, not a span: a text leaf needs a key, not an element.
            // Wrapping every run of prose in a span would put thousands of
            // empty nodes on a reader's page for nothing.
            return (
              <Fragment key={index}>
                {renderWithSlots(node.text, slots)}
              </Fragment>
            );
        }
      })}
    </>
  );
}
