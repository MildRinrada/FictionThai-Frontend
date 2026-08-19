import type { ReactNode } from "react";

/**
 * Marks every occurrence of the query inside a text (search review section
 * D5): a reader who searched "a" must be able to SEE where "a" matched, or
 * the result reads as arbitrary.
 *
 * Case-insensitive plain substring - the same match rule the API's ILIKE
 * uses, so the highlight never claims a match the server did not make.
 */
export function highlight(text: string, query: string): ReactNode {
  const needle = query.trim().toLowerCase();
  if (!needle || !text) return text;

  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  let key = 0;
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key} className="ft-mark-yellow rounded-xs text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    key += 1;
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (parts.length === 0) return text;
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/** Whether the query occurs in the text, by the same rule highlight uses. */
export function matches(text: string | undefined | null, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle || !text) return false;
  return text.toLowerCase().includes(needle);
}
