/**
 * Comment resources - docs/09 §20.
 *
 * Comments are plain text; the API stores them raw and the UI renders them as
 * text nodes, never as markup (docs/11 §16).
 */

export interface CommentAuthor {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface Comment {
  id: string;
  novel_id: string;
  /** Present for a chapter comment, absent for a fiction-level comment. */
  chapter_id?: string | null;
  /** Present for a reply, absent for a top-level comment. */
  parent_id?: string | null;
  content: string;
  /** True when the text was changed after posting. */
  edited: boolean;
  created_at: string;
  updated_at: string;
  /**
   * Absent for a GUEST comment (§13D), where `guest_name` is present instead.
   * Two fields rather than one synthesised card, because a name anybody may
   * type must never render as an identity: there is no profile behind it and
   * nothing to link to.
   */
  author?: CommentAuthor | null;
  /** The name a guest typed. Display only - it identifies nobody. */
  guest_name?: string | null;
  /** Visible replies under this comment (top-level listings only). */
  reply_count: number;
  /** The heart (comment design review 2026-08). */
  like_count: number;
  /** Whether the caller's own heart is among them. */
  is_liked?: boolean;
  /** True for the caller's own comments - enables edit/delete affordances. */
  is_owner: boolean;
  /**
   * The comment is waiting for the fiction's author to review it (§13D).
   * Present on the CREATE response and in the author's queue; a reader listing
   * never contains one.
   */
  pending?: boolean;
}

/** The server-side limit, mirrored for the form's counter (docs/09 §20). */
export const COMMENT_MAX_LENGTH = 5000;

/** The server-side limit on the name a guest types. */
export const GUEST_NAME_MAX_LENGTH = 40;

/**
 * What to call the person who wrote a comment.
 *
 * One function, because three surfaces render it and a guest must read the same
 * way in all of them. The suffix is deliberate: a reader scanning a thread
 * should be able to tell an account from a typed-in name without clicking.
 */
export function commentAuthorName(comment: Comment): string {
  if (comment.author) {
    return comment.author.display_name || comment.author.username;
  }
  return comment.guest_name ?? "ผู้อ่าน";
}

/** Whether this comment was written without an account. */
export function isGuestComment(comment: Comment): boolean {
  return !comment.author;
}
