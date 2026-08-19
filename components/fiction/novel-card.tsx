import Link from "next/link";

import { Cover } from "@/components/fiction/cover";
import { FormatBadges } from "@/components/fiction/format-badges";
import { Badge } from "@/components/ui/badge";
import { count, relativeTime } from "@/lib/format";
import { PresentationFormat, ageRatingLabel, presentationLabel } from "@/types/fiction";
import type { Novel } from "@/types/novel";

/**
 * The fiction card family.
 *
 * One fiction appears on a shelf, in a compact update row, and as a search
 * result - three shapes of the same object. They live together so a one-shot
 * looks like a one-shot everywhere (docs/15 §5.9), and they all read from the
 * same fields, so none of them can invent a statistic the API does not return.
 *
 * All three are Server Components: cards are the bulk of every discovery page
 * and must ship no JavaScript (docs/07 §20).
 */

const STATUS_LABELS: Record<string, string> = {
  ongoing: "กำลังเผยแพร่",
  completed: "จบแล้ว",
  hiatus: "พักการเผยแพร่",
  cancelled: "ยกเลิก",
};

function authorName(novel: Novel): string {
  return novel.author.display_name ?? novel.author.username;
}

function href(novel: Novel): string {
  return `/novel/${encodeURIComponent(novel.slug)}`;
}

/** How many chapters, phrased for the fiction's own structure. */
function extent(novel: Novel): string {
  return novel.uses_chapter_navigation ? `${count(novel.chapter_count)} ตอน` : "จบในตอน";
}

/**
 * Readership, compacted for a card.
 *
 * Returns an empty string below a thousand: "7 อ่าน" on a new fiction reads as a
 * verdict on it, and the card is better off saying nothing than saying that.
 */
function readership(novel: Novel): string {
  if (novel.view_count < 1000) return "";
  if (novel.view_count < 1_000_000) {
    return `${Math.round(novel.view_count / 100) / 10}K อ่าน`;
  }
  return `${Math.round(novel.view_count / 100_000) / 10}M อ่าน`;
}

/**
 * The age badge - on EVERY card (home review round 2, reaffirmed).
 *
 * The first pass badged only 15+/18+ on the "ทั่วไป is the norm" principle,
 * which meant a catalogue of general-rated stories showed no rating anywhere -
 * and on a platform a guest can open without signing in, the review is right
 * that the absence of a mark is not a mark.
 *
 * FILLED, where the format chip beside it is outlined (review round 5): two
 * identical outline chips in a row read as one kind of label, and the rating
 * was being read as a category. The fill is what says "this one is the
 * rating" without a word of explanation.
 */
function RatingBadge({ novel }: { novel: Novel }) {
  const gated = ageRatingLabel(novel.age_rating);
  return (
    <span
      className={`inline-flex min-h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] ${
        gated
          ? "border-secondary-300 bg-secondary-50 text-secondary-600"
          : "border-border bg-surface-secondary text-text-muted"
      }`}
    >
      <span className="sr-only">เรตอายุ: </span>
      {gated || "ทุกวัย"}
    </span>
  );
}

/**
 * The presentation chip - also on every card (home review round 2).
 *
 * The chapter-format system is the platform's differentiator, and a shelf full
 * of unmarked covers hides it from exactly the first-time visitor it should be
 * winning over. ร้อยแก้ว shows in neutral; แชท, เฮดแคนอน, and ผสมรูปแบบ - the
 * ones a reader is actively choosing between - carry the accent.
 */
function FormatChip({ novel }: { novel: Novel }) {
  const highlighted =
    novel.has_mixed_formats ||
    novel.presentation_format !== PresentationFormat.Standard;
  const label = novel.has_mixed_formats
    ? "ผสมรูปแบบ"
    : presentationLabel(novel.presentation_format);
  if (!label) return null;
  return (
    <span
      className={`inline-flex min-h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] ${
        highlighted ? "border-primary-200 text-primary" : "border-border text-text-muted"
      }`}
    >
      <span className="sr-only">รูปแบบการนำเสนอ: </span>
      {label}
    </span>
  );
}

/**
 * The shelf card: cover-led, for grids and horizontal shelves.
 *
 * `rank` renders the position badge used on ranked shelves. It is passed in
 * rather than derived, because a card must not assume its own index means a
 * ranking.
 *
 * The rating and format chips ride every card (home review E): the age badge
 * because a guest can open anything a card offers, and the format chip because
 * chat/headcanon is what makes this shelf different from every competitor's.
 */
export function NovelCoverCard({
  novel,
  rank,
  hideAuthor = false,
}: {
  novel: Novel;
  rank?: number;
  /**
   * On an author's own profile every card is theirs - repeating the name
   * under each cover was noise (profile review 2026-08).
   */
  hideAuthor?: boolean;
}) {
  const chips = [
    <RatingBadge key="rating" novel={novel} />,
    <FormatChip key="format" novel={novel} />,
  ];

  return (
    <Link href={href(novel)} className="group block">
      <span className="relative block">
        <Cover url={novel.cover_url} title={novel.title} />
        {rank !== undefined ? (
          <span className="absolute start-1.5 top-1.5 inline-flex min-w-6 items-center justify-center rounded-sm bg-[#292731]/85 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white tabular-nums">
            {rank}
          </span>
        ) : null}
      </span>

      <span className="mt-2.5 block font-serif text-[15px] leading-snug font-semibold group-hover:text-primary">
        <span className="line-clamp-2">{novel.title}</span>
      </span>
      {!hideAuthor ? (
        <span className="mt-1 block truncate text-xs text-text-secondary">
          {authorName(novel)}
        </span>
      ) : null}
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
        {/* The story's status rides every card (profile review section H):
            จบแล้ว/กำลังเขียน is a fact readers decide by, same as the rating. */}
        <span>
          {[readership(novel), extent(novel), STATUS_LABELS[novel.status] ?? ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {chips}
      </span>
    </Link>
  );
}

/**
 * The update row: a dense line for "latest chapters" style lists, where the
 * cover is an identifier rather than the point.
 */
export function NovelRow({ novel }: { novel: Novel }) {
  return (
    <Link
      href={href(novel)}
      className="group flex items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-surface"
    >
      <Cover
        url={novel.cover_url}
        title={novel.title}
        className="w-11"
        showFallbackLabel={false}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-serif text-sm font-semibold group-hover:text-primary">
            {novel.title}
          </span>
          <RatingBadge novel={novel} />
          <FormatChip novel={novel} />
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">
          {authorName(novel)} · {extent(novel)}
        </span>
      </span>
      <span className="shrink-0 text-xs text-text-muted">
        {relativeTime(novel.updated_at)}
      </span>
    </Link>
  );
}

export interface NovelCardProps {
  novel: Novel;
}

/**
 * The result card: the fullest shape, used by search and explore where the
 * reader is deciding between fictions rather than recognising one.
 */
export function NovelCard({ novel }: NovelCardProps) {
  return (
    <Link
      href={href(novel)}
      className="group flex gap-4 rounded-lg border border-border bg-surface p-3.5 hover:border-primary-200"
    >
      <Cover url={novel.cover_url} title={novel.title} className="w-19" />

      <span className="min-w-0 flex-1">
        <span className="mb-2 flex flex-wrap items-center gap-1.5">
          <FormatBadges format={novel} />
          <RatingBadge novel={novel} />
        </span>

        <span className="block font-serif text-base leading-snug font-semibold group-hover:text-primary">
          <span className="line-clamp-2">{novel.title}</span>
        </span>

        <span className="mt-1 block text-xs text-text-secondary">
          {[
            authorName(novel),
            extent(novel),
            STATUS_LABELS[novel.status] ?? novel.status,
            readership(novel),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>

        {novel.description ? (
          <span className="mt-2 block text-[13px] leading-relaxed text-text-secondary">
            <span className="line-clamp-2">{novel.description}</span>
          </span>
        ) : null}

        {novel.genres.length > 0 ? (
          <span className="mt-2.5 flex flex-wrap gap-1.5">
            {novel.genres.map((genre) => (
              <Badge key={genre.id}>{genre.name}</Badge>
            ))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
