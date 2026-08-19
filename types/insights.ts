/**
 * The studio overview's numbers and activity feed (§13R).
 *
 * Mirrors `backend/internal/insights`. Owner-only: the API answers with the
 * same 404 a stranger gets for a private draft, so a failed fetch is never
 * evidence that a fiction exists.
 */

/** What happened, so the client picks the verb rather than parsing a sentence. */
export const ActivityKind = {
  Comment: "comment",
  Post: "community_post",
} as const;
export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];

/** One line of ความเคลื่อนไหวล่าสุด. */
export interface Activity {
  kind: ActivityKind;
  /** A display name. Never an account id, never an email. */
  actor: string;
  /** The first part of what they wrote, when the event has text of its own. */
  excerpt?: string;
  /** Where a comment landed. Absent for a comment on the fiction itself. */
  chapter_slug?: string;
  chapter_label?: string;
  /** Present on a community post, for the link. */
  post_id?: string;
  created_at: string;
}

/** `GET /novels/:ref/insights` - owner only. */
export interface NovelInsights {
  /**
   * Reads in the window, de-duplicated per viewer per day by the recorder.
   * A count of READS, not of people, and never to be labelled as people.
   */
  weekly_views: number;
  weekly_comments: number;
  /** The same sums over the window BEFORE this one, for the comparison. */
  prev_weekly_views: number;
  prev_weekly_comments: number;
  /** Exactly `window_days` entries, oldest first, today last. Zero-filled. */
  views_by_day: number[];
  comments_by_day: number[];
  /** What "weekly" meant, so no client has to assume seven. */
  window_days: number;
  /** Newest first. Always an array. */
  activity: Activity[];
}
