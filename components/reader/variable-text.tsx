import type { NovelVariable } from "@/types/variable";

/**
 * Renders authored text with variable slots
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * A Server Component. Each occurrence of a declared token becomes its own
 * element carrying the author's default, so a client island can swap in the
 * reader's own answer after hydration WITHOUT the chapter text having to be
 * shipped to the browser as JavaScript (docs/07 §20).
 *
 * The stored text is never modified. This is a render-time presentation of the
 * author's tokens and nothing more, which is why two readers of the same cached
 * chapter receive identical bytes and why an author can rename a token later.
 *
 * Tokens are matched LITERALLY with split(), never compiled into a regular
 * expression, so an author cannot write a placeholder that turns into a
 * catastrophic pattern.
 */

/** One token and what a slot for it should show before the reader answers. */
export interface TokenSlot {
  token: string;
  fallback: string;
}

/**
 * Flattens declarations into the slot list this component matches on.
 *
 * Longest token first. Without that ordering a pronoun's base token "(p/n)"
 * would be matched inside "(p/n.เจ้าของ)" and split it into nonsense.
 */
export function slotsFor(
  variables: NovelVariable[],
  fallback = "คุณ",
): TokenSlot[] {
  const slots: TokenSlot[] = [];
  for (const variable of variables) {
    for (const token of variable.tokens ?? [variable.token]) {
      slots.push({ token, fallback: variable.default_value || fallback });
    }
  }
  return slots.sort((a, b) => b.token.length - a.token.length);
}

/**
 * Splits text on every slot token, emitting a `data-var-slot` element for each.
 *
 * Returns the string unchanged when nothing matches, so prose in a fiction with
 * no variables costs no extra elements at all.
 */
export function renderWithSlots(
  text: string,
  slots: TokenSlot[],
): React.ReactNode {
  if (slots.length === 0) return text;

  let parts: React.ReactNode[] = [text];

  for (const slot of slots) {
    const next: React.ReactNode[] = [];
    for (const part of parts) {
      if (typeof part !== "string" || !part.includes(slot.token)) {
        next.push(part);
        continue;
      }
      const pieces = part.split(slot.token);
      pieces.forEach((piece, index) => {
        if (piece !== "") next.push(piece);
        if (index < pieces.length - 1) {
          next.push(
            <span
              key={`${slot.token}-${next.length}`}
              data-var-slot={slot.token}
            >
              {slot.fallback}
            </span>,
          );
        }
      });
    }
    parts = next;
  }

  if (parts.length === 1 && typeof parts[0] === "string") return parts[0];
  return parts.map((part, index) =>
    typeof part === "string" ? <span key={index}>{part}</span> : part,
  );
}
