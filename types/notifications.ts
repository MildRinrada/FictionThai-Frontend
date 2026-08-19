/**
 * Notification resources - docs/09 §23, docs/08 §23.1.
 *
 * The type list is open on the server (VARCHAR, documented as examples), so
 * the union keeps a string escape hatch: an unknown type renders generically
 * instead of crashing the feed.
 */

export type NotificationType =
  | "new_follower"
  | "new_comment"
  | "comment_reply"
  | "novel_update"
  | "system"
  | (string & {});

export interface NotificationActor {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface Notification {
  id: string;
  type: NotificationType;
  /** Absent for system notifications and hard-deleted actors. */
  actor?: NotificationActor | null;
  entity_type?: string | null;
  entity_id?: string | null;
  read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface UnreadCount {
  unread_count: number;
}
