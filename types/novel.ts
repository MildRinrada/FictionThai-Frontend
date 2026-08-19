/**
 * Fiction and chapter resources, client side.
 *
 * These mirror `backend/internal/novels` and `backend/internal/chapters`
 * exactly. The backend is authoritative: docs/09 §51 requires that web and
 * mobile clients must not invent their own interpretations of these values.
 *
 * There is ONE fiction type. One-shot, chat, and headcanon are values of the
 * three independent format dimensions in `types/fiction.ts`, never subtypes -
 * so there is deliberately no `ChatNovel` or `HeadcanonNovel` here
 * (docs/08 §43 Rule 6, docs/CONTENT-MODEL.md §7).
 */

import type {
  ContentMode,
  FictionFormat,
  PresentationFormat,
  StoryStructure,
} from "@/types/fiction";
import type { Term } from "@/types/taxonomy";

/** Publication status (docs/08 §7.1). Independent of visibility. */
export const NovelStatus = {
  Draft: "draft",
  Ongoing: "ongoing",
  Completed: "completed",
  Hiatus: "hiatus",
  Cancelled: "cancelled",
} as const;
export type NovelStatus = (typeof NovelStatus)[keyof typeof NovelStatus];

/**
 * The one vocabulary for a status, shared by the settings form and the studio
 * overview - a local copy in each is how "พักการเผยแพร่" and "พักไว้" end up
 * describing one value on two screens.
 */
export const NOVEL_STATUS_LABELS: Record<NovelStatus, string> = {
  [NovelStatus.Draft]: "ฉบับร่าง",
  [NovelStatus.Ongoing]: "กำลังเผยแพร่",
  [NovelStatus.Completed]: "จบแล้ว",
  [NovelStatus.Hiatus]: "พักการเผยแพร่",
  [NovelStatus.Cancelled]: "ยกเลิก",
};

/**
 * Who may reach the fiction (docs/08 §7.1, §13C).
 *
 * A LADDER, widest to narrowest. Three values could only say "everyone",
 * "anyone with the link", or "nobody"; the two rungs writers keep asking for
 * are the same request - publish, but not to the open internet.
 */
export const Visibility = {
  /** ทุกคน - listed, and readable by a guest. */
  Public: "public",
  /** เฉพาะสมาชิก - any signed-in reader. Still listed: the gate is at the door. */
  Members: "members",
  /** เฉพาะผู้ติดตาม - readers who follow the author. Never listed. */
  Followers: "followers",
  /** ลิงก์ลับ - reachable by direct link, excluded from listings (docs/11 §31). */
  Unlisted: "unlisted",
  /** ส่วนตัว - the author alone. */
  Private: "private",
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

/**
 * The ladder as the create and settings forms present it: label, one line of
 * what it actually means, and nothing else.
 *
 * The helper text is not decoration. Every one of these rungs has been mistaken
 * for its neighbour by someone, and the difference between ลิงก์ลับ and
 * เฉพาะสมาชิก is the difference between work a stranger can open and work they
 * cannot.
 */
export const VISIBILITY_CHOICES: ReadonlyArray<{
  value: Visibility;
  label: string;
  hint: string;
}> = [
  {
    value: Visibility.Public,
    label: "สาธารณะ",
    hint: "อยู่ในหน้ารวมและค้นเจอ ใครก็อ่านได้ ไม่ต้องสมัคร",
  },
  {
    value: Visibility.Members,
    label: "เฉพาะสมาชิก",
    hint: "ยังอยู่ในหน้ารวม แต่ต้องล็อกอินก่อนถึงจะเปิดอ่านได้",
  },
  {
    value: Visibility.Followers,
    label: "เฉพาะผู้ติดตาม",
    hint: "เฉพาะคนที่กดติดตามคุณ ไม่ขึ้นในหน้ารวมและค้นไม่เจอ",
  },
  {
    value: Visibility.Unlisted,
    label: "ลิงก์ลับ",
    hint: "ใครมีลิงก์ก็อ่านได้ แต่ไม่ขึ้นที่ไหนเลย เหมาะกับให้เพื่อนอ่านก่อน",
  },
  {
    value: Visibility.Private,
    label: "ส่วนตัว",
    hint: "เห็นคนเดียว ยังเขียนและแก้ได้ตามปกติ",
  },
];

/**
 * The three states the badge beside the title offers.
 *
 * เฉพาะสมาชิก and เฉพาะผู้ติดตาม are specialist rungs - and เฉพาะสมาชิก in
 * particular contradicts the platform's own promise that reading needs no
 * account. Offering five choices at the moment someone wants to publish forces
 * a decision they never asked to make, so the main control carries the three
 * anyone can explain in a sentence, and the other two stay on the fiction's
 * settings page for the writers who go looking for them.
 */
export const VISIBILITY_MENU: ReadonlyArray<Visibility> = [
  Visibility.Public,
  Visibility.Unlisted,
  Visibility.Private,
];

/**
 * The author's statement about their own work
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13B).
 *
 * Required on create. It is the one create-form field that is neither
 * unavoidable (a title) nor immediately visible in the editor (structure,
 * presentation), and it is asked anyway because it decides where the work may
 * appear at all.
 */
export const AgeRating = {
  General: "general",
  /** 15+ - a dismissible warning before reading, never a sign-in. */
  Teen: "teen",
  /** 18+ - gated by {@link AgeGate}, and kept out of listings. */
  Mature: "mature",
  /**
   * 18+ เนื้อหาทางเพศชัดเจน. Split from {@link AgeRating.Mature} because one
   * value had to serve two very different works, and treating them identically
   * meant either gating the first harder than it needs or the second softer
   * than the platform can defend.
   *
   * A signed-in reader is required ALWAYS - a platform rule, not an author
   * setting - and it never appears in a browse surface, whatever the reader's
   * own 18+ switch says.
   */
  Explicit: "explicit",
} as const;
export type AgeRating = (typeof AgeRating)[keyof typeof AgeRating];

/** Whether a rating is 18+ in either of its two forms. */
export function isAdultRating(rating: AgeRating | ""): boolean {
  return rating === AgeRating.Mature || rating === AgeRating.Explicit;
}

/**
 * How 18+ work is gated - the WRITER's choice between protection and reach.
 *
 * Only meaningful when the rating is `mature`, but stored regardless, so a
 * writer who moves a work to 18+ and back does not lose the setting.
 */
export const AgeGate = {
  /**
   * A warning shown before every read, guests included. This is what keeps
   * "ไม่ต้องสมัคร" reachable for work whose author wants it reachable. It is
   * honest about being a warning and nothing more.
   */
  Warning: "warning",
  /**
   * A signed-in reader. The rung the ladder was missing: the gap between
   * "click to continue" and "send us your ID" is enormous, and this is where
   * most 18+ work actually belongs.
   */
  Login: "login",
  /**
   * Only readers who completed identity verification. The document itself is
   * never retained - only the derived facts (§13B).
   */
  Verified: "verified",
} as const;
export type AgeGate = (typeof AgeGate)[keyof typeof AgeGate];

/**
 * The gate choices offered for a rating.
 *
 * Explicit work has a FLOOR: the API refuses the warning gate outright rather
 * than accepting it and overriding it, so the form must not offer it. A control
 * that is silently ignored is worse than a control that is absent.
 */
export function gateChoicesFor(
  rating: AgeRating | "",
): ReadonlyArray<{ value: AgeGate; label: string; hint: string }> {
  const warning = {
    value: AgeGate.Warning,
    label: "เตือนก่อนเข้าอ่าน",
    hint: "ขึ้นคำเตือนให้กดยืนยัน ไม่ต้องสมัครก็อ่านได้",
  } as const;
  const login = {
    value: AgeGate.Login,
    label: "ต้องล็อกอินก่อน",
    hint: "ต้องมีบัญชีถึงจะเปิดอ่านได้",
  } as const;
  const verified = {
    value: AgeGate.Verified,
    label: "ต้องยืนยันตัวตน",
    hint: "เฉพาะผู้อ่านที่ยืนยันอายุกับระบบแล้ว เข้าถึงได้น้อยที่สุด",
  } as const;

  return rating === AgeRating.Explicit ? [login, verified] : [warning, login, verified];
}

/** The gate a rating starts at when the author names none. Mirrors the API. */
export function defaultGateFor(rating: AgeRating | ""): AgeGate {
  return rating === AgeRating.Explicit ? AgeGate.Login : AgeGate.Warning;
}

/** The field that separates the two worlds a fiction search keeps apart. */
export const OriginType = {
  Original: "original",
  Fanfiction: "fanfiction",
} as const;
export type OriginType = (typeof OriginType)[keyof typeof OriginType];

/** Chapter publication state (docs/08 §8.1). */
export const ChapterStatus = {
  Draft: "draft",
  Scheduled: "scheduled",
  Published: "published",
  Unpublished: "unpublished",
} as const;
export type ChapterStatus = (typeof ChapterStatus)[keyof typeof ChapterStatus];

/** One chat entry's kind (docs/08 §10.1). */
export const MessageType = {
  Message: "message",
  System: "system",
  Separator: "separator",
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * The author's stated permissions (§13E).
 *
 * DECLARATIONS, not enforcement. Screenshots cannot be prevented, so the
 * platform never claims to prevent one - these are rendered to readers as "what
 * the author allows", and any UI that implies otherwise is a bug.
 */
export interface NovelRights {
  allow_screenshot: boolean;
  allow_translation: boolean;
  allow_derivative: boolean;
  allow_audio: boolean;
  require_credit: boolean;
  /** The author's own condition beside `allow_derivative`. */
  derivative_terms?: string;
}

/** ตั้งค่าเพิ่มเติม - the collapsed create-form section (§13K). */
export interface NovelExtras {
  language: string;
  /** What this fiction calls a chapter: ตอน / บท / EP. Presentation only. */
  chapter_unit: string;
  author_note_start?: string;
  author_note_end?: string;
  /** Series membership, grouped by author and name until a series table exists. */
  series_name?: string;
  series_position?: number;
  /**
   * Who may add to the thread (§13D). Enforced by the API, not a label: a
   * closed thread refuses new comments, and the ทุกคน level really does accept
   * one from a reader with no account.
   */
  comment_access: CommentAccess;
  /**
   * Hold MEMBER comments for the author's review. Guest comments are held
   * whatever this says - see {@link CommentAccess.Everyone}.
   */
  comment_approval: boolean;
  rights: NovelRights;
}

/**
 * Who may add to a fiction's thread (§13D).
 *
 * It replaced a single boolean, because one boolean could not express the thing
 * this platform is for: "ไม่ต้องสมัครก็อ่านได้" is a promise about READING, and
 * the thread is exactly where a guest most wants to say something.
 */
export const CommentAccess = {
  /**
   * ทุกคน - a reader with no account may comment, with a name they type.
   * Their comment is held for the author's review ALWAYS, whatever
   * `comment_approval` says: there is no account behind it to warn or suspend.
   */
  Everyone: "everyone",
  /** เฉพาะสมาชิก - a signed-in account is required. What `true` used to mean. */
  Members: "members",
  /** ปิด - nobody adds to the thread. Existing comments stay. */
  Off: "off",
} as const;
export type CommentAccess = (typeof CommentAccess)[keyof typeof CommentAccess];

export const COMMENT_ACCESS_CHOICES: ReadonlyArray<{
  value: CommentAccess;
  label: string;
  hint: string;
}> = [
  {
    value: CommentAccess.Everyone,
    label: "ทุกคน",
    hint: "คนไม่ล็อกอินก็คอมเมนต์ได้ โดยใส่ชื่อเอง - คอมเมนต์จะรอให้คุณตรวจก่อนเสมอ",
  },
  {
    value: CommentAccess.Members,
    label: "เฉพาะสมาชิก",
    hint: "ต้องล็อกอินก่อนถึงจะคอมเมนต์ได้",
  },
  {
    value: CommentAccess.Off,
    label: "ปิดคอมเมนต์",
    hint: "ไม่รับคอมเมนต์ใหม่ ของเดิมยังอยู่ครบ",
  },
];

/** The public identity shown alongside a fiction. Never carries an email. */
export interface Author {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  /** External writer-support link (EasyDonate). Present only if the author set one. */
  donation_url?: string;
}

/**
 * A fiction.
 *
 * The three format dimensions are flat on the resource (docs/09 §14.5), which
 * `extends FictionFormat` expresses.
 *
 * Owner-only fields are optional because the API omits them entirely for a
 * reader rather than sending a zero value (docs/08 §1.4).
 */
export interface Novel extends FictionFormat, NovelExtras {
  id: string;
  slug: string;
  title: string;
  description?: string;
  /**
   * คำโปรย (§13S) - the one line under a cover.
   *
   * Distinct from `description`, which is the synopsis a reader opens the
   * fiction page for. A card that truncates the synopsis instead shows every
   * fiction the first sentence of its plot summary rather than the line its
   * author would have chosen.
   */
  tagline?: string;
  /** บทนำ (§13S) - what the author says before the story begins. */
  foreword?: string;
  cover_url?: string;
  content_warning?: string;
  /**
   * Fold the warning behind a reader-operated button (13U): a warning names
   * what happens in the story, and for some stories that IS the spoiler.
   */
  content_warning_spoiler?: boolean;

  /** The fiction page's accent, lowercase #rrggbb, when the author chose one. */
  theme_color?: string;

  /**
   * The author keeps the hearts/views scoreboard off this fiction (13U). When
   * true for a non-owner the counter fields are zeroed server-side - render
   * NOTHING, never "0".
   */
  counts_hidden?: boolean;

  /** Public co-writer credit (13U). Present on the single-fiction view. */
  collaborators?: CollaboratorCredit[];

  status: NovelStatus;

  /**
   * Creation fields (docs/PHASE-13-CREATION-AND-CONTROL.md §13A).
   *
   * `age_rating` is always present because a card has to badge it and a reader
   * deciding whether to open a work should not need a second request to learn
   * it is 18+. `age_gate` is the writer's choice of how 18+ work is gated and
   * is only meaningful at `mature`.
   */
  age_rating: AgeRating;
  age_gate: AgeGate;
  origin_type: OriginType;
  /** The source a fanfiction is written from; never set on original work. */
  fandom?: string;

  /**
   * Discovery metadata - always arrays, possibly empty (docs/08 §14, §15).
   * Distinct from the three format dimensions, which stay first-class fields
   * and are never duplicated as tags (docs/08 §15.2).
   */
  genres: Term[];
  tags: Term[];

  author: Author;

  /**
   * The identity the work is published under - the pen name the author chose
   * for it, or their default. Absent when the writer keeps no pen names; a
   * client then falls back to the author's display name.
   */
  pen_name?: string;

  /** What the viewer may actually reach: published chapters, or all for the owner. */
  chapter_count: number;

  /**
   * Whether the reader should offer chapter navigation. Served by the API so
   * web and mobile cannot disagree about the rule (docs/09 §51).
   */
  uses_chapter_navigation: boolean;

  /**
   * Whether any chapter renders as something other than the fiction's own
   * format (§13J). DERIVED by the API from the chapters that exist - mixing is
   * not a mode a writer turns on, it is what happens when chapters differ.
   */
  has_mixed_formats: boolean;

  /*
   * Reader variables live in their own resource since 13H - see
   * types/variable.ts and GET /novels/:ref/variables. They were yn_enabled and
   * yn_token in 12B; the migration carried every declaration across.
   */

  /**
   * Whether the work uses reader variables (y/n) - derived by the API from
   * the declarations that exist, so a card can badge it and search can filter
   * on it (search review 2026-08 section B).
   */
  has_reader_variables?: boolean;

  /**
   * The first PUBLISHED chapter's slug, so a result card offers "อ่านตอนแรก"
   * as one click (search review section D6). Absent when nothing is live.
   */
  first_chapter_slug?: string;

  /**
   * Display counters (docs/PHASE-12-STORY-DEPTH.md §12C).
   *
   * Always sent, so a card never has to decide whether a missing number means
   * zero. `view_count` is de-duplicated per reader per day before it is
   * incremented - it is not, and must not be presented as, a per-reader record.
   */
  view_count: number;
  like_count: number;
  bookmark_count: number;

  published_at?: string;
  created_at: string;
  updated_at: string;

  // --- owner-only ---------------------------------------------------------
  is_owner: boolean;
  /**
   * Whether the VIEWER may edit this fiction's content: the owner, or a
   * collaborator (13U). The studio opens on this; settings, publishing, and
   * deletion still key off `is_owner`.
   */
  can_edit?: boolean;
  visibility?: Visibility;
  draft_chapter_count?: number;
  /** The scheduled first publish, when one is set (13U). */
  publish_at?: string;
  /** The author's display settings, echoed for the settings form (13U). */
  hide_counts?: boolean;
  show_donate?: boolean;
}

/** A co-writer as the public sees them (13U). */
export interface CollaboratorCredit {
  username: string;
  display_name?: string;
  avatar_url?: string;
  /** The credit wording the author chose; empty means the plain name. */
  credit?: string;
}

/** Allowlisted message properties (docs/11 §18). Never application state. */
export interface MessageMetadata {
  /** Which side of the conversation the speaker appears on (docs/06 §16). */
  side?: "left" | "right";
}

/** One chat message (docs/08 §10.1). */
export interface ChatMessage {
  id: string;
  position: number;
  speaker_name: string;
  speaker_avatar_url?: string;
  message_type: MessageType;
  content: string;
  metadata?: MessageMetadata;
}

/**
 * How a chapter's prose is READ (§13N).
 *
 * Not a claim about what is stored - text either way. `plain` is the pre-13N
 * model and the default for every chapter written before the editor existed;
 * moving between the two writes no content in either direction.
 */
export const ContentFormat = {
  Plain: "plain",
  Markdown: "markdown",
} as const;
export type ContentFormat = (typeof ContentFormat)[keyof typeof ContentFormat];

/** One headcanon entry - the third representation (§13J, 12F). */
export interface HeadcanonEntry {
  id: string;
  position: number;
  /** The character this entry is about, when there is a record for them. */
  character_id?: string;
  name: string;
  /** Answers to the chapter's `entry_fields`, positionally. */
  values: string[];
  body: string;
  /**
   * A picture the author attached to this entry (§13M). Absent is the norm -
   * an entry is complete with a name and a body.
   */
  image_url?: string;
}

/** A chapter in a list: metadata only, never content (docs/07 §21). */
export interface ChapterSummary {
  id: string;
  chapter_number: number;
  title?: string;
  slug: string;
  status: ChapterStatus;
  word_count: number;

  /**
   * What THIS chapter declared, or null to follow the fiction (§13J). Null
   * rather than absent, so "follows the fiction" is distinguishable from a
   * build of the API that does not send the field.
   */
  presentation_format: PresentationFormat | null;

  /**
   * What it RESOLVED to. The API decides; clients render this rather than
   * re-deriving the rule from the fiction's format (docs/09 §51).
   */
  active_format: PresentationFormat;

  /**
   * Whether the ACTIVE representation has content - prose for standard,
   * messages for chat, entries for headcanon. Derived per request by the API,
   * so it can never drift from the current format (docs/CONTENT-MODEL.md §6).
   */
  content_ready: boolean;

  /**
   * The sizes of the chat and headcanon representations (13X), so a list row
   * can state its quantity in the active mode's own unit - words for prose,
   * messages for chat, entries for headcanon.
   */
  message_count: number;
  entry_count: number;

  /** How the prose is read (§13N). Sent on the summary too, so the studio's
   *  chapter list can show which older chapters are still literal text. */
  content_format: ContentFormat;

  /** Owner-only (§13T). When the chapter is scheduled, the moment it goes up. */
  scheduled_at?: string;

  published_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * A full chapter.
 *
 * `content` and `messages` are always present and may be null. A READER
 * receives only the active representation; an OWNER receives both, which is
 * what proves to a writer that changing format destroyed nothing
 * (docs/CONTENT-MODEL.md §6).
 */
export interface Chapter extends ChapterSummary {
  novel_id: string;
  content: string | null;
  messages: ChatMessage[] | null;
  entries: HeadcanonEntry[] | null;

  /** The topic's field labels. Always sent, so an empty topic still has heads. */
  entry_fields: string[];

  previous_chapter_id?: string;
  next_chapter_id?: string;

  // --- owner-only ---------------------------------------------------------
  is_owner: boolean;
  scheduled_at?: string;
  has_standard_content?: boolean;
  has_chat_content?: boolean;
  has_entries?: boolean;
}

/** `PATCH /novels/:id/format` response (docs/09 §14.8). */
export interface FormatChangeResult extends FictionFormat {
  id: string;
  /**
   * The fiction now presents as chat but has no chat content prepared. It is a
   * WARNING for the author (docs/08 §11) and must never trigger a conversion.
   */
  needs_chat_setup: boolean;
}

/**
 * `POST /novels` request body.
 *
 * Every format dimension is optional and takes its documented default. The one
 * REQUIRED field the create form adds is `age_rating`
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13A) - it decides where the work may
 * appear, so a value the author never chose would be a claim they never made.
 */
export interface CreateNovelRequest {
  title: string;
  age_rating: AgeRating;
  age_gate?: AgeGate;
  origin_type?: OriginType;
  fandom?: string;
  description?: string;
  /** คำโปรย (§13S) - at most 200 characters. */
  tagline?: string;
  /** บทนำ (§13S). */
  foreword?: string;
  cover_url?: string;
  content_warning?: string;
  story_structure?: StoryStructure;
  presentation_format?: PresentationFormat;
  content_mode?: ContentMode;
  /** ฟิคแบบผสม: each chapter picks its own presentation (§13J). */
  mixed_formats?: boolean;
  status?: NovelStatus;
  visibility?: Visibility;
  /**
   * ตั้งค่าเพิ่มเติม (§13K). Every one is optional - a writer who never opens
   * the section gets the server's documented defaults.
   */
  language?: string;
  chapter_unit?: string;
  author_note_start?: string;
  author_note_end?: string;
  series_name?: string;
  series_position?: number;
  comment_access?: CommentAccess;
  comment_approval?: boolean;
  allow_screenshot?: boolean;
  allow_translation?: boolean;
  allow_derivative?: boolean;
  allow_audio?: boolean;
  require_credit?: boolean;
  derivative_terms?: string;

  /** 13U display choices. */
  content_warning_spoiler?: boolean;
  hide_counts?: boolean;
  show_donate?: boolean;
  theme_color?: string;

  /** Discovery metadata (docs/09 §15). At most 3 genres and 10 tags. */
  genre_ids?: string[];
  tag_ids?: string[];
}

/**
 * `PATCH /novels/:ref` request body.
 *
 * Separate from {@link CreateNovelRequest} because a PATCH has to express a
 * third case the create body cannot: `null` CLEARS a nullable field, an absent
 * key leaves it alone, and a value replaces it (docs/09 §3). Deriving this type
 * from the create request would make "clear the synopsis" unrepresentable.
 *
 * The format dimensions are absent on purpose - they have their own endpoint so
 * the resulting format state is validated as a whole (docs/09 §15).
 */
export interface UpdateNovelRequest {
  title?: string;
  description?: string | null;
  /** คำโปรย (§13S). null clears it. */
  tagline?: string | null;
  /** บทนำ (§13S). null clears it. */
  foreword?: string | null;
  cover_url?: string | null;
  content_warning?: string | null;
  status?: NovelStatus;
  visibility?: Visibility;

  age_rating?: AgeRating;
  age_gate?: AgeGate;
  origin_type?: OriginType;
  fandom?: string | null;

  /** ตั้งค่าเพิ่มเติม (§13K). An absent field keeps what the fiction has. */
  language?: string;
  chapter_unit?: string;
  author_note_start?: string | null;
  author_note_end?: string | null;
  series_name?: string | null;
  series_position?: number | null;
  comment_access?: CommentAccess;
  comment_approval?: boolean;
  allow_screenshot?: boolean;
  allow_translation?: boolean;
  allow_derivative?: boolean;
  allow_audio?: boolean;
  require_credit?: boolean;
  derivative_terms?: string | null;

  /** 13U display choices. null clears the colour. */
  content_warning_spoiler?: boolean;
  hide_counts?: boolean;
  show_donate?: boolean;
  theme_color?: string | null;

  /**
   * ตั้งเวลาเผยแพร่ (13U): an RFC 3339 future time schedules the first
   * publish (send alongside an exposed visibility); null cancels the schedule.
   */
  publish_at?: string | null;

  /** A present list replaces the whole set; an absent one leaves it alone. */
  genre_ids?: string[];
  tag_ids?: string[];
}

/**
 * One entry on the pre-publish checklist
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13L).
 *
 * `key` is stable and machine-readable so the client can link each item to the
 * field that satisfies it rather than matching on a message.
 */
export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  /** What to do about it. Present only when the item is not done. */
  hint?: string;
  /**
   * Whether this item blocks the publish. A false one is advice - the cover,
   * today - and the checklist renders it as แนะนำ rather than pretending all
   * rows are equally mandatory.
   */
  required: boolean;
}

/** `GET /novels/:ref/readiness` - owner-only. */
export interface Readiness {
  items: ReadinessItem[];
  /**
   * Whether every REQUIRED item is done. The API refuses to publish when this
   * is false, so the client never has to decide (docs/11 §43).
   */
  ready: boolean;
}

/** Allowlisted filters for `GET /novels` (docs/09 §11 + search review 2026-08). */
export interface NovelListQuery {
  q?: string;
  story_structure?: FictionFormat["story_structure"];
  presentation_format?: FictionFormat["presentation_format"];
  content_mode?: FictionFormat["content_mode"];
  status?: NovelStatus;
  /**
   * Term filters by SLUG. Each accepts a comma-separated list: included terms
   * must ALL match, excluded tags must all be absent.
   */
  genre?: string;
  tag?: string;
  exclude_tag?: string;
  author?: string;
  sort?: NovelSort;
  /**
   * The reader turning ซ่อนเนื้อหา 18+ off (§13B). A REQUEST, not a decision:
   * the API honours it only for a signed-in caller, and never for explicit
   * work.
   */
  adult?: boolean;
  /** Exactly one age rating: general | teen | mature. */
  rating?: string;
  /** ประเภทงาน: original | fanfiction | crossover | single. */
  origin?: string;
  /** Free-text substring filters (docs/FANDOM.md - no vocabulary). */
  fandom?: string;
  character?: string;
  /** Comma-separated words the content warning must NOT mention. */
  exclude_warning?: string;
  /** Bounds on the live chapter count. */
  min_chapters?: number;
  max_chapters?: number;
  /** Updated within the last N days. */
  updated_within?: number;
  /** "1" keeps only works with reader variables (y/n). */
  variables?: string;
  page?: number;
  per_page?: number;
}

/** The server keeps the authoritative allowlist (docs/09 §10). */
export const NovelSort = {
  Latest: "latest",
  Updated: "updated",
  Title: "title",
  Created: "created",
  /** Ranked by bookmark count (docs/09 §10). */
  Popular: "popular",
  /** Ranked by public-shelf adds (search review 2026-08). */
  Shelved: "shelved",
  /** Query-aware ordering; the search default when a text query is present. */
  Relevance: "relevance",
} as const;
export type NovelSort = (typeof NovelSort)[keyof typeof NovelSort];
