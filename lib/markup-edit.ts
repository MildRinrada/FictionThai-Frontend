/**
 * The paragraph indent, as CONTENT that older chapters still carry (§13N, §13Q).
 *
 * ย่อหน้าอัตโนมัติ used to TYPE two ideographic spaces at the start of every
 * paragraph. That made the indent something a writer could delete by accident,
 * something a paste from another site never got, and something the editor had
 * to re-insert on every Enter. It is a CSS rule now - `.ft-editor p` and
 * `.reading-surface p` - so it is simply true of every paragraph, the caret
 * cannot land inside it, and backspace cannot take it away.
 *
 * What is left here is the constant, because the chapters written under the old
 * behaviour still have those characters in them and they are the author's text.
 * They are never removed: a paragraph that begins with one opts OUT of the CSS
 * rule instead, so it looks exactly as it always did.
 *
 * `indentFor` and `applyReplacement` used to live here. Both existed to type
 * the indent into a field, and there is no longer a field it is typed into.
 */

/** The Thai paragraph indent, as the old auto-tab typed it. */
export const INDENT = "　　";
