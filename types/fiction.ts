/**
 * The Fiction Format System, client side.
 *
 * These mirror `backend/internal/fiction` exactly. The backend is authoritative
 * - docs/09 §51 requires that web and mobile clients must not invent their own
 * interpretations of format values.
 *
 * Three INDEPENDENT dimensions (docs/08 §2). Do not merge them into one union
 * such as `"headcanon_chat_one_shot"`; every combination is valid, and a future
 * value must be addable without touching the others (docs/08 §43 Rule 6).
 */

/** How the work is organised into reading units. */
export const StoryStructure = {
  OneShot: "one_shot",
  MultiChapter: "multi_chapter",
} as const;
export type StoryStructure =
  (typeof StoryStructure)[keyof typeof StoryStructure];

/**
 * How published content is rendered to readers.
 *
 * Each value names one of the three representations a chapter may hold
 * (docs/CONTENT-MODEL.md §2). It selects which one is ACTIVE; it never selects
 * which one exists, and changing it converts nothing.
 */
export const PresentationFormat = {
  Standard: "standard",
  Chat: "chat",
  /** Renders the chapter's entries - a topic of characters (§13J, 12F). */
  Headcanon: "headcanon",
} as const;
export type PresentationFormat =
  (typeof PresentationFormat)[keyof typeof PresentationFormat];

/** How the author classifies the content. */
export const ContentMode = {
  General: "general",
  Headcanon: "headcanon",
} as const;
export type ContentMode = (typeof ContentMode)[keyof typeof ContentMode];

/** A complete format state, as returned on every fiction resource. */
export interface FictionFormat {
  story_structure: StoryStructure;
  presentation_format: PresentationFormat;
  content_mode: ContentMode;
}

/**
 * รูปแบบเริ่มต้นของตอนแรก - the three answers the create form asks for (§13J).
 *
 * THREE, not four. A "ผสม" card was tried and removed: a writer who picks one
 * format can already change any chapter later, so the card locked nothing while
 * telling the other three that they had. Mixing is not a mode - it is what
 * happens when chapters differ, and `has_mixed_formats` reports it after the
 * fact.
 *
 * A presentation layer over the format dimensions, not a fourth dimension: the
 * API stores the same independent columns it always did, and this is the
 * vocabulary a writer thinks in. Keeping the mapping in one function is what
 * lets the create form, the settings page, and the badges agree.
 */
export const WorkFormat = {
  Prose: "prose",
  Chat: "chat",
  Headcanon: "headcanon",
} as const;
export type WorkFormat = (typeof WorkFormat)[keyof typeof WorkFormat];

/** The format fields a work-format choice sends. */
export function workFormatRequest(choice: WorkFormat): {
  presentation_format: PresentationFormat;
  content_mode: ContentMode;
} {
  switch (choice) {
    case WorkFormat.Chat:
      return {
        presentation_format: PresentationFormat.Chat,
        content_mode: ContentMode.General,
      };
    case WorkFormat.Headcanon:
      return {
        presentation_format: PresentationFormat.Headcanon,
        content_mode: ContentMode.Headcanon,
      };
    default:
      return {
        presentation_format: PresentationFormat.Standard,
        content_mode: ContentMode.General,
      };
  }
}

/** Which of the three a fiction's own format is. */
export function workFormatOf(format: FictionFormat): WorkFormat {
  switch (format.presentation_format) {
    case PresentationFormat.Chat:
      return WorkFormat.Chat;
    case PresentationFormat.Headcanon:
      return WorkFormat.Headcanon;
    default:
      return WorkFormat.Prose;
  }
}

/** `GET /api/v1/fiction-formats` - the server-published vocabulary. */
export interface FictionFormatVocabulary {
  story_structures: StoryStructure[];
  presentation_formats: PresentationFormat[];
  content_modes: ContentMode[];
  defaults: FictionFormat;
}

/**
 * Whether the reader should offer chapter navigation.
 *
 * A one-shot is a single reading unit, so a chapter list must not appear for it
 * (docs/15 §5.2).
 */
export function usesChapterNavigation(format: FictionFormat): boolean {
  return format.story_structure === StoryStructure.MultiChapter;
}

/**
 * Whether the reader renders structured chat messages rather than prose
 * (docs/08 §11).
 */
export function usesStructuredMessages(format: FictionFormat): boolean {
  return format.presentation_format === PresentationFormat.Chat;
}

/**
 * Which reader component should render this fiction.
 *
 * `"unsupported"` is deliberate: docs/09 §52 requires that a format value this
 * client build does not know about degrades to a safe fallback rather than
 * crashing or rendering the content wrongly.
 */
export type ReaderKind = "standard" | "chat" | "headcanon" | "unsupported";

/**
 * Which reader renders a given ACTIVE format.
 *
 * Takes the format value rather than a fiction, because since §13J the answer
 * belongs to the chapter: the API resolves `active_format` per chapter and the
 * reader follows it, so a mixed work renders each chapter correctly without the
 * client re-deriving the rule (docs/09 §51).
 */
export function readerKindForFormat(value: string): ReaderKind {
  switch (value) {
    case PresentationFormat.Standard:
      return "standard";
    case PresentationFormat.Chat:
      return "chat";
    case PresentationFormat.Headcanon:
      return "headcanon";
    default:
      return "unsupported";
  }
}

/** The fiction-level answer - the fallback for a chapter that declares none. */
export function readerKindFor(format: FictionFormat): ReaderKind {
  return readerKindForFormat(format.presentation_format);
}

/** A badge describing one format dimension, for cards and filters. */
export interface FormatBadge {
  /** The dimension this badge came from. */
  dimension: "story_structure" | "presentation_format" | "content_mode";
  value: string;
  /** Thai label - the platform is Thai-first (docs/05 §11). */
  label: string;
}

const STORY_STRUCTURE_LABELS: Record<StoryStructure, string> = {
  [StoryStructure.OneShot]: "เรื่องสั้นจบในตอน",
  [StoryStructure.MultiChapter]: "หลายตอน",
};

const PRESENTATION_FORMAT_LABELS: Record<PresentationFormat, string> = {
  [PresentationFormat.Standard]: "ร้อยแก้ว",
  [PresentationFormat.Chat]: "แชทล้วน",
  [PresentationFormat.Headcanon]: "เฮดแคนอน",
};

const CONTENT_MODE_LABELS: Record<ContentMode, string> = {
  [ContentMode.General]: "ทั่วไป",
  [ContentMode.Headcanon]: "งานเฮดแคนอน",
};

/**
 * The age-rating badge, for a card
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13B).
 *
 * ทั่วไป gets no badge: it is the norm, and badging it would put a label on
 * every card on the platform. 15+ and 18+ are the ones a reader is deciding
 * about, so they are the ones that appear.
 */
export function ageRatingLabel(value: string): string {
  switch (value) {
    case "teen":
      return "15+";
    case "mature":
      return "18+";
    case "explicit":
      // Never listed on a browse surface, but the owner's own cards and the
      // fiction page still badge it - and "ทุกวัย" is the one thing it is not.
      return "18+";
    default:
      return "";
  }
}

/**
 * The presentation label, for a compact meta line that carries no other format
 * information - a post's fiction card, where "ฟิค" is worth saying because
 * nothing else on the line says it.
 *
 * An unknown value yields an empty string, so a future format degrades to one
 * missing word rather than to `undefined` on the page (docs/09 §52).
 */
export function presentationLabel(value: string): string {
  return PRESENTATION_FORMAT_LABELS[value as PresentationFormat] ?? "";
}

/** The content-mode label, empty for the unremarkable `general` default. */
export function contentModeLabel(value: string): string {
  if (value === ContentMode.General) return "";
  return CONTENT_MODE_LABELS[value as ContentMode] ?? "";
}

/**
 * Badges for a fiction, derived from format metadata rather than from tags.
 *
 * docs/08 §15.2: format-related tags must not be duplicated as ordinary tags
 * when the information already exists as first-class fiction metadata.
 *
 * `general` produces no badge - it is the default and labelling it would add
 * noise to every card.
 */
export function formatBadges(format: FictionFormat, mixed = false): FormatBadge[] {
  const badges: FormatBadge[] = [];

  const structure = STORY_STRUCTURE_LABELS[format.story_structure];
  if (structure) {
    badges.push({
      dimension: "story_structure",
      value: format.story_structure,
      label: structure,
    });
  }

  // Standard prose is the norm, so only the other presentations are flagged.
  // A work whose chapters disagree with it is badged "ผสมรูปแบบ" instead - that
  // is what a reader is actually choosing between, and it is DERIVED from the
  // chapters rather than claimed by a setting (§13J).
  if (mixed) {
    badges.push({
      dimension: "presentation_format",
      value: "mixed",
      label: "ผสมรูปแบบ",
    });
  } else if (format.presentation_format !== PresentationFormat.Standard) {
    const label = PRESENTATION_FORMAT_LABELS[format.presentation_format];
    if (label) {
      badges.push({
        dimension: "presentation_format",
        value: format.presentation_format,
        label,
      });
    }
  }

  if (format.content_mode === ContentMode.Headcanon) {
    badges.push({
      dimension: "content_mode",
      value: format.content_mode,
      label: CONTENT_MODE_LABELS[ContentMode.Headcanon],
    });
  }

  return badges;
}
