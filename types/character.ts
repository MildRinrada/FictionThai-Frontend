/**
 * A fiction's cast, client side.
 *
 * Mirrors `backend/internal/characters` exactly
 * (docs/PHASE-12-STORY-DEPTH.md §12A). The backend is authoritative: a
 * character is only ever returned for a fiction the caller may already read, so
 * nothing here re-derives visibility.
 */

/**
 * One author-defined fact.
 *
 * There is deliberately no fixed field schema - ชื่อเต็ม / อายุ / อาชีพ are
 * examples an author may replace entirely. Both sides are plain text and are
 * rendered as text nodes, never as markup.
 */
export interface CharacterDetail {
  label: string;
  value: string;
}

export interface Character {
  id: string;
  novel_id: string;

  name: string;
  role?: string;
  summary?: string;
  avatar_url?: string;
  description?: string;
  quote?: string;

  /** Always arrays, never null - the API normalises them. */
  traits: string[];
  details: CharacterDetail[];

  /**
   * Chat presentation preferences (chat-editor review 2026-08): the colour
   * that identifies this character in the composer, the side their bubbles
   * sit on, and the short name the speaker strip shows. Set from the strip's
   * own popover and saved here so every chapter's composer agrees.
   */
  chat_color?: string;
  chat_side?: "left" | "right";
  chat_display_name?: string;

  /** The author's ordering of the cast. Not a ranking. */
  position: number;
  first_chapter_id?: string;

  /**
   * Chapter ids, in chapter order. Carried by both the single read and the
   * list; absent means "no appearances", so default it to [].
   */
  appears_in?: string[];

  created_at: string;
  updated_at: string;
}

/** `POST /novels/:ref/characters` body. Only the name is required. */
export interface CreateCharacterRequest {
  name: string;
  role?: string | null;
  summary?: string | null;
  avatar_url?: string | null;
  description?: string | null;
  quote?: string | null;
  traits?: string[];
  details?: CharacterDetail[];
  first_chapter_id?: string | null;

  chat_color?: string | null;
  chat_side?: "left" | "right" | null;
  chat_display_name?: string | null;
}

/**
 * `PATCH /novels/:ref/characters/:id` body.
 *
 * `null` clears a field and an omitted key leaves it alone - the same three-case
 * contract the fiction PATCH uses (docs/09 §3).
 */
export type UpdateCharacterRequest = Partial<CreateCharacterRequest>;
