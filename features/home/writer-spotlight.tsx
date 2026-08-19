import Link from "next/link";

import { SectionHeader } from "@/components/ui/section-header";
import { Icon } from "@/components/ui/icon";
import { FollowButton } from "@/features/library/follow-button";
import {
  spotlightName,
  type SpotlightKind,
  type SpotlightWriter,
  type WriterSpotlightView,
} from "@/types/profile";

/**
 * อันดับนักเขียน - the horizontal band under ยอดนิยม
 * (docs/WRITER-SPOTLIGHT.md, home review round 5).
 *
 * A row of PEOPLE between two shelves of covers: avatar, pen name, one quiet
 * line, follow. The heading names the week's ranking and its metric, because
 * an unexplained ladder of names invites exactly the comparison anxiety the
 * design is trying to avoid.
 *
 * What the cards deliberately do NOT show: follower counts, view totals, or
 * any exact number. The API sends bands ("50+") and the streak's week count,
 * nothing finer - so this component could not print an exact popularity
 * figure even by mistake.
 *
 * Fewer than three writers renders nothing at all. The service already skips
 * to the next ranking in the rotation; this guard is for the day every
 * ranking is thin, when no band is better than a lonely one.
 */

const MIN_WRITERS = 3;

const KIND_COPY: Record<
  SpotlightKind,
  { title: string; subLabel: string; empty: string }
> = {
  rising: {
    title: "นักเขียนมาแรงเดือนนี้",
    subLabel: "On the rise · จากยอดเพิ่มเข้าชั้นหนังสือ ไม่ใช่ยอดวิว · สลับเกณฑ์ทุกสัปดาห์",
    empty: "กำลังมาแรง",
  },
  newcomer: {
    title: "นักเขียนหน้าใหม่น่าจับตา",
    subLabel: "New voices · เริ่มเผยแพร่ใน 90 วันที่ผ่านมา · สลับเกณฑ์ทุกสัปดาห์",
    empty: "นักเขียนหน้าใหม่",
  },
  consistent: {
    title: "นักเขียนที่ลงตอนสม่ำเสมอ",
    subLabel: "Steady updates · มีตอนใหม่ต่อเนื่องหลายสัปดาห์ · สลับเกณฑ์ทุกสัปดาห์",
    empty: "ลงตอนสม่ำเสมอ",
  },
};

/** The one quiet line under a name - a band or a streak, never a raw count. */
function metricLine(kind: SpotlightKind, writer: SpotlightWriter): string {
  if (kind === "consistent" && writer.streak_weeks) {
    return `ลงตอนต่อเนื่อง ${writer.streak_weeks} สัปดาห์`;
  }
  if (writer.band) {
    return `เข้าชั้นหนังสือ ${writer.band} ครั้งเดือนนี้`;
  }
  return KIND_COPY[kind].empty;
}

export function WriterSpotlight({
  spotlight,
  signedIn,
}: {
  spotlight: WriterSpotlightView | null;
  signedIn: boolean;
}) {
  if (!spotlight || spotlight.writers.length < MIN_WRITERS) return null;
  const copy = KIND_COPY[spotlight.kind] ?? KIND_COPY.rising;

  return (
    <section aria-labelledby="writers-heading" className="mt-14">
      <SectionHeader
        id="writers-heading"
        title={copy.title}
        subLabel={copy.subLabel}
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {spotlight.writers.slice(0, 6).map((writer) => (
          <li key={writer.id}>
            <div className="flex h-full flex-col items-center rounded-lg border border-border bg-surface p-4 text-center">
              <Link
                href={`/users/${encodeURIComponent(writer.username)}`}
                className="group flex min-w-0 flex-col items-center"
              >
                {writer.avatar_url ? (
                  // Avatars come from object storage - no optimizer loader.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={writer.avatar_url}
                    alt=""
                    className="size-14 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-14 items-center justify-center rounded-full border border-border bg-surface-secondary"
                  >
                    <Icon name="user" size={22} className="text-text-muted" />
                  </span>
                )}
                <span className="mt-2.5 w-full truncate font-serif text-sm font-semibold group-hover:text-primary">
                  {spotlightName(writer)}
                </span>
              </Link>
              <span className="mt-1 w-full truncate text-[11px] text-text-muted">
                {metricLine(spotlight.kind, writer)}
              </span>
              <span className="mt-2.5">
                {signedIn ? (
                  <FollowButton authorId={writer.id} variant="secondary" compact />
                ) : (
                  // A guest's follow starts at sign-in, with the intent kept
                  // (docs/02 §5.2) - no six failing status probes on a
                  // public page. Same outline weight as the real button.
                  <Link
                    href="/login?next=/"
                    className="inline-flex min-h-11 items-center rounded-md border border-primary px-4 text-sm font-medium text-primary hover:bg-primary/5"
                  >
                    ติดตาม
                  </Link>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-muted">
        ตัวเลขแสดงเป็นช่วงเสมอ · นักเขียนเลือกไม่แสดงชื่อในอันดับได้ที่{" "}
        <Link href="/settings/profile" className="text-primary hover:underline">
          ตั้งค่าโปรไฟล์
        </Link>
      </p>
    </section>
  );
}
