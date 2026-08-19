/**
 * The writer's shell (`GET /me/desk`).
 *
 * Four facts the header asks for once per page: how much unfinished work is
 * waiting, what was written today, which fictions were touched last, and where
 * the writer stopped typing. It describes the CALLER and nobody else - there is
 * no id to pass and no way to point it at another account.
 */

/** One of the writer's own fictions, as a row in the create menu. */
export interface DeskWork {
  slug: string;
  title: string;
  /** That fiction's share of the studio badge. */
  unfinished: number;
  updated_at: string;
}

/** "เขียนต่อจากที่ค้าง" - one link back into the editor. */
export interface DeskResume {
  novel_slug: string;
  novel_title: string;
  chapter_slug: string;
  chapter_label: string;
  updated_at: string;
}

export interface Desk {
  /**
   * Drafts WITH WORDS IN THEM that nobody can read yet - the number on the
   * studio link. Empty chapters are never counted: a badge a writer cannot
   * clear without deleting something is a badge they learn to ignore.
   */
  unfinished: number;
  /** Words added today, in the writer's own day (Asia/Bangkok). */
  words_today: number;
  recent: DeskWork[];
  resume?: DeskResume;
}

/** One of the writer's own pieces of work, found by name in the search box. */
export interface DeskHit {
  novel_slug: string;
  novel_title: string;
  chapter_slug: string;
  chapter_label: string;
  /** Unpublished - which is most of what a writer is searching for. */
  draft: boolean;
}
