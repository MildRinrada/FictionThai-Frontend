import { RichText } from "@/components/reader/rich-text";
import { renderWithSlots, type TokenSlot } from "@/components/reader/variable-text";
import { INDENT } from "@/lib/markup-edit";
import { ContentFormat } from "@/types/novel";

/**
 * Standard prose presentation (docs/01 §9.1, docs/06 §15).
 *
 * A Server Component: prose is inert text and ships no JavaScript - the reader
 * path stays cheap (docs/07 §20).
 *
 * Content is TEXT under both models. React escapes it on render; nothing here
 * or in RichText uses dangerouslySetInnerHTML, so a chapter cannot carry script
 * no matter what is stored (docs/11 §17).
 *
 * WHICH reading applies is the chapter's own `content_format` (§13N), never a
 * guess from the text. A chapter written before the editor existed is literal
 * text, and the platform does not get to decide that its author meant markup.
 */

export interface ProseViewProps {
  content: string;
  /**
   * How to read the text. Defaults to the pre-13N model, so any caller that
   * has not been taught about the field renders exactly what it used to.
   */
  format?: ContentFormat;
  /**
   * The fiction's reader variables, flattened to token slots
   * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
   *
   * Each occurrence is rendered as its own element carrying the author's
   * default, so a client island can swap in the reader's own answer after
   * hydration WITHOUT the chapter text having to be shipped to the browser as
   * JavaScript. The stored text is never modified - this is a render-time
   * presentation of the author's tokens, nothing more.
   */
  slots?: TokenSlot[];
}

export function ProseView({
  content,
  slots = [],
  format = ContentFormat.Plain,
}: ProseViewProps) {
  if (format === ContentFormat.Markdown) {
    return <RichText content={content} slots={slots} />;
  }

  // Blank lines separate paragraphs; single newlines inside a paragraph are
  // preserved by whitespace-pre-wrap. This renders exactly what the author
  // typed, which is the whole content model.
  const paragraphs = content.split(/\n{2,}/);

  // `.reading-surface` carries the measure, size, line-height, face, and colour
  // from the reading tokens, which the reader's settings override as CSS
  // variables - so this component never needs to know a preference exists.
  return (
    <div className="reading-surface">
      {paragraphs.map((paragraph, index) => (
        // A paragraph that already begins with the ideographic indent the old
        // auto-tab typed opts out of the CSS one, so it is never indented twice
        // and the author's characters are never touched (§13Q).
        <p key={index} className={paragraph.startsWith(INDENT) ? "ft-typed-indent" : ""}>
          {renderWithSlots(paragraph, slots)}
        </p>
      ))}
    </div>
  );
}
