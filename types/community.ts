/**
 * Community resources - docs/09 §21, docs/08 §21.
 *
 * Post and comment text is plain text; the API stores it raw and the UI
 * renders it as text nodes, never as markup (docs/11 §16). The allowlists
 * mirror the backend's - the API is the authority, these exist so components
 * never scatter arbitrary strings.
 */

export type CommunityVisibility = "public" | "followers" | "private";

export const COMMUNITY_VISIBILITIES: CommunityVisibility[] = [
  "public",
  "followers",
  "private",
];

/** The one allowlisted reaction type (docs/09 §21; docs/01 §20.2). */
export type ReactionType = "like";

export const REACTION_TYPES: ReactionType[] = ["like"];

/**
 * The author's declared intent for a post (docs/COMMUNITY-FEED.md). Labels a
 * post and filters the feed; never gates anything.
 */
export type CommunityPostType =
  | "discussion"
  | "announcement"
  | "plot_help"
  | "beta_request"
  | "fic_request"
  | "event";

export const POST_TYPES: CommunityPostType[] = [
  "discussion",
  "announcement",
  "plot_help",
  "beta_request",
  "fic_request",
  "event",
];

export const POST_TYPE_LABELS: Record<CommunityPostType, string> = {
  discussion: "พูดคุย",
  announcement: "ประกาศตอนใหม่",
  plot_help: "ขอความช่วยเหลือเรื่องพล็อต",
  beta_request: "หาเบต้า/นักเขียนร่วม",
  fic_request: "รับคำขอเขียน",
  event: "อีเวนต์เขียน",
};

export interface CommunityAuthor {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

/**
 * The fiction a post is about (docs/PHASE-12-STORY-DEPTH.md §12D).
 *
 * The API resolves this against the READER on every request, so its absence
 * carries no information: a post that attached nothing and a post about a
 * fiction this reader may not open look exactly the same here. The UI must
 * therefore render a post without a card as an ordinary post - never as a
 * broken one, and never with a placeholder naming what is missing.
 */
export interface PostReference {
  novel_id: string;
  novel_slug: string;
  novel_title: string;
  cover_url?: string | null;

  story_structure: string;
  presentation_format: string;
  content_mode: string;

  /** The fiction's rating, so the card badges 18+ work like every other card. */
  age_rating: string;

  /** Present only when the post attached a chapter rather than a fiction. */
  chapter_id?: string | null;
  chapter_slug?: string | null;
  chapter_number?: number | null;
  chapter_title?: string | null;
  word_count?: number | null;
}

/** One entry of "fictions people are posting about" (§12D). */
export interface DiscussedFiction {
  fiction: PostReference;
  post_count: number;
}

/** What a composer sends to attach a fiction; both accept an id or a slug. */
export interface PostReferenceInput {
  novel_id: string;
  chapter_id?: string;
}

export interface CommunityPost {
  id: string;
  content: string;
  visibility: CommunityVisibility;
  post_type: CommunityPostType | string;
  edited: boolean;
  created_at: string;
  updated_at: string;
  author: CommunityAuthor;
  comment_count: number;
  reaction_count: number;
  /** The caller's own reaction type; absent for none and for guests. */
  my_reaction?: ReactionType | string;
  /** Whether the caller saved this post; absent for guests and when false. */
  bookmarked?: boolean;
  /** Absent whenever there is no card to show - see {@link PostReference}. */
  reference?: PostReference | null;
  is_owner: boolean;
}

/** One row of "แท็กที่กำลังพูดถึง" (docs/COMMUNITY-FEED.md). */
export interface TrendingTag {
  tag: string;
  post_count: number;
}

/** The bookmark endpoints' answer. */
export interface BookmarkState {
  post_id: string;
  bookmarked: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  parent_id?: string | null;
  content: string;
  edited: boolean;
  created_at: string;
  updated_at: string;
  author: CommunityAuthor;
  reply_count: number;
  is_owner: boolean;
}

export interface ReactionState {
  post_id: string;
  my_reaction?: string;
  reaction_count: number;
}

/** Server-side limits, mirrored for form counters. */
export const POST_MAX_LENGTH = 10000;
export const COMMUNITY_COMMENT_MAX_LENGTH = 5000;
