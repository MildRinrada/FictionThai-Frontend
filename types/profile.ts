/**
 * A person's public profile - `GET /users/:ref`
 * (docs/PHASE-12-STORY-DEPTH.md §12E).
 *
 * This is the PUBLIC half of an identity and nothing else. It deliberately has
 * no email, no role, and no account status: those live on `CurrentUser`, which
 * only ever describes the caller themselves (docs/10 §8). Keeping them as two
 * types is what stops an account field appearing on a stranger's page because
 * a component reached for the wrong one.
 *
 * Every field is the same for every viewer, which is why the page that renders
 * it can be cached. Anything personal - whether you follow this person - is a
 * separate request made after mount.
 */
/** One writer-published contact link. The label is the writer's own word. */
export interface ProfileLink {
  label: string;
  url: string;
}

/** What a writer says they are currently taking on. */
export type OpenFor = "commission" | "request" | "beta";

export const OPEN_FOR_LABEL: Record<OpenFor, string> = {
  commission: "รับคอมมิชชัน",
  request: "เปิดรับฟิคขอ",
  beta: "รับเบต้าอ่าน",
};

/**
 * One identity a writer publishes under
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 2).
 *
 * A pen name is CHANGEABLE; `username` is not. `note` is the writer's own label
 * for what the identity is for (แยกแนว, ร่วมเขียน) - free text, never an enum
 * the platform defines. `is_default` is which name a work that named none of
 * its own is published under.
 *
 * The same shape serves the public list and the owner's editor: a pen name is
 * printed on the covers, so there is nothing owner-only about it.
 */
export interface PenNameView {
  id: string;
  name: string;
  note?: string | null;
  is_default: boolean;
}

/**
 * One of the three works a writer put at the top of their own profile, with
 * their one line about it. The API re-checks readability on every read, so an
 * unpublished pin is simply absent.
 */
export interface PinnedWork {
  novel_id: string;
  slug: string;
  title: string;
  note?: string | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  /** Profile cover image, chosen by the owner; null renders the placeholder. */
  banner_url?: string | null;
  bio?: string | null;
  website_url?: string | null;
  /** Always an array from the API, never null. */
  links: ProfileLink[];

  /** Account creation date. */
  joined_at: string;

  is_author: boolean;
  /**
   * There is exactly ONE pen name per person (docs/08 §6.3 keys
   * author_profiles by user_id), so this is an attribute of the writer - never
   * a list to page through.
   */
  pen_name?: string | null;
  author_bio?: string | null;
  /** The writer's own external support link; FictionThai never handles it. */
  donation_url?: string | null;
  /** A status the writer sets and clears. The platform brokers none of it. */
  open_for: OpenFor[];
  /**
   * คำเตือน/ขอบเขตของนักเขียน - what this writer will and will not write, in
   * their own words. Rendered verbatim as text, never parsed into tags: the
   * platform keeps no list of what a person may decline.
   */
  boundaries?: string | null;
  /**
   * Whether this person accepts messages on their profile. Public so the page
   * knows whether to ask for the wall at all - a closed wall is absent, not
   * broken.
   */
  wall_enabled: boolean;
  /**
   * The writer's choice to stay out of the home page's writer rankings
   * (docs/WRITER-SPOTLIGHT.md) - the hide_counts principle, one level up.
   */
  hide_from_rankings: boolean;

  /**
   * Every identity this writer publishes under. Always an array from the API,
   * never null. Distinct from `pen_name` above, which is the single
   * author_profiles field the page's heading uses.
   */
  pen_names: PenNameView[];
  /**
   * Names used within the last 30 days and no longer used - the
   * «เคยใช้ชื่อ …» line. A window, not an archive: it exists so a name being
   * taken over can be noticed, never to follow someone forever.
   */
  former_names: string[];
  /** Up to three works the owner chose to lead with. */
  pinned: PinnedWork[];

  /** Publicly readable works only - a draft has no readers to count. */
  novel_count: number;
  /** How many of those are finished stories - the number a reader decides by. */
  completed_count?: number;
  follower_count: number;
  total_views: number;
}

/**
 * อันดับนักเขียน - `GET /writers/spotlight` (docs/WRITER-SPOTLIGHT.md).
 *
 * Three rankings take one ISO week each: rising (bookshelf adds this month),
 * newcomer (first published within 90 days), consistent (live chapters in
 * consecutive weeks). The API decides which; the client only renders it.
 */
export type SpotlightKind = "rising" | "newcomer" | "consistent";

export interface SpotlightWriter {
  id: string;
  username: string;
  display_name?: string | null;
  pen_name?: string | null;
  avatar_url?: string | null;
  /**
   * Coarse metric only - "10+", "50+", "100+", or absent below the first
   * threshold. The API never sends an exact count, by design.
   */
  band?: string;
  /** Set only on the consistent ranking: weeks with a chapter, in a row. */
  streak_weeks?: number;
}

export interface WriterSpotlightView {
  kind: SpotlightKind;
  writers: SpotlightWriter[];
}

/** The card name for a spotlight entry - the pen name wins, as everywhere. */
export function spotlightName(writer: SpotlightWriter): string {
  return writer.pen_name ?? writer.display_name ?? writer.username;
}

/**
 * The name to show for someone, in the order the platform prefers.
 *
 * The pen name wins: it is the name a writer chose to be READ under, and the
 * profile's one large heading is where a chosen identity belongs. The handle
 * stays beneath it, unchanged and addressable
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
 */
export function profileName(profile: PublicProfile): string {
  return profile.pen_name ?? profile.display_name ?? profile.username;
}
