import { Badge } from "@/components/ui/badge";
import { type FictionFormat, formatBadges } from "@/types/fiction";

/**
 * Renders a fiction's format badges.
 *
 * The badges come from the fiction's format METADATA, not from tags
 * (docs/08 §15.2), and every listing surface uses this one component so a
 * one-shot looks the same on the home page, in search results, and in a
 * reader's library (docs/15 §5.9).
 */

const TONE_BY_DIMENSION = {
  story_structure: "neutral",
  presentation_format: "primary",
  content_mode: "secondary",
} as const;

const SR_LABEL_BY_DIMENSION = {
  story_structure: "รูปแบบเรื่อง",
  presentation_format: "รูปแบบการนำเสนอ",
  content_mode: "ประเภทเนื้อหา",
} as const;

export interface FormatBadgesProps {
  /**
   * Whether the fiction's chapters actually disagree with its own format
   * (§13J). Derived by the API from the chapters that exist, so the badge can
   * never claim a mix the reader will not find.
   */
  mixed?: boolean;
  format: FictionFormat;
}

export function FormatBadges({ format, mixed = false }: FormatBadgesProps) {
  const badges = formatBadges(format, mixed);
  if (badges.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="รูปแบบของนิยาย">
      {badges.map((badge) => (
        <li key={`${badge.dimension}:${badge.value}`}>
          <Badge
            tone={TONE_BY_DIMENSION[badge.dimension]}
            srLabel={SR_LABEL_BY_DIMENSION[badge.dimension]}
          >
            {badge.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
