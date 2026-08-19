/**
 * Public bookshelves and the profile comment wall, client side.
 *
 * These mirror `backend/internal/shelves` and `backend/internal/wall` exactly.
 *
 * The distinction the whole feature rests on, restated here because this file
 * is where a frontend engineer will look for it: a SHELF is not a bookmark.
 * Bookmarks live in `types/library.ts`, are private forever, and appear on no
 * public surface at all. A shelf is a collection someone assembled on purpose
 * and chose, per shelf, to publish. Nothing in this file can read a bookmark,
 * and no switch here turns one into a shelf item.
 *
 * The API has already filtered every list it returns - a public shelf carries
 * only fictions a stranger may open. The frontend renders what it is given and
 * never re-derives visibility (docs/07 §5, docs/11 §43).
 */

import type { Novel } from "@/types/novel";

/** Bounds, mirrored from the Go service so the form can stop before the API does. */
export const SHELF_NAME_MAX = 60;
export const SHELF_NOTE_MAX = 160;
export const SHELF_MAX = 20;
export const WALL_BODY_MAX = 1000;

/** One fiction on a shelf, with the reader's own line about why it is there. */
export interface ShelfItem {
  novel: Novel;
  note?: string | null;
  added_at: string;
}

export interface Shelf {
  id: string;
  name: string;
  note?: string | null;
  /**
   * Whether strangers can see this shelf. False by default and per shelf -
   * publishing one is an act on that shelf alone.
   */
  is_public: boolean;
  position: number;
  /**
   * How many items THIS viewer may see. Always consistent with `items`, which
   * the API caps: a public shelf never reports a count that includes fictions
   * the viewer is not shown.
   */
  item_count: number;
  items: ShelfItem[];
  created_at: string;
  updated_at: string;
}

/** One message on somebody's profile wall. */
export interface WallEntry {
  id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  };
  /** The viewer wrote this one. */
  is_owner: boolean;
  /**
   * The viewer may remove it: its author, or the person whose page it is. The
   * API decides; the UI only renders the affordance it is told about.
   */
  can_delete: boolean;
}

/** The name to show beside a wall message. */
export function wallAuthorName(entry: WallEntry): string {
  return entry.author.display_name ?? entry.author.username;
}
