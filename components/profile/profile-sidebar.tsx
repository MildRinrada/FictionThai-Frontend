import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import type { ProfileLink, PublicProfile } from "@/types/profile";

/**
 * The left column of a profile: who this person is, and the numbers behind it.
 *
 * **It collapses while empty.** A brand-new profile has no introduction and no
 * numbers worth showing, and rendering that as two separate bordered boxes made
 * the page look broken rather than new. So: one card until there is something
 * to separate, then แนะนำตัว and ตัวเลข as their own sections
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
 *
 * Every figure has a source - `novel_count`, `follower_count`, and
 * `total_views` come from the profile response, which counts only publicly
 * readable work (§12C, §12E).
 */

export function ProfileSidebar({
  profile,
  bioEditor,
  extrasEditor,
}: {
  profile: PublicProfile;
  /**
   * The owner's in-place bio editor (profile review 2026-08, section A).
   * When present it replaces the static text - the empty card becomes the
   * door, never a dead end.
   */
  bioEditor?: React.ReactNode;
  /** The owner's link/availability/boundaries rows, under the bio. */
  extrasEditor?: React.ReactNode;
}) {
  const intro = profile.author_bio ?? profile.bio;
  const links = profileLinks(profile);
  const stats = statRows(profile);

  // "Worth splitting" means there is something in both halves. One filled half
  // and one empty one is still a single card.
  const split = Boolean(intro) && stats.length > 0;

  return (
    <aside className="flex flex-col gap-5">
      {split ? (
        <>
          <section className="rounded-xl border border-border bg-surface p-4">
            <p className="mono-label">แนะนำตัว</p>
            <Intro intro={intro} links={links} bioEditor={bioEditor} boundaries={profile.boundaries} />
            {extrasEditor}
          </section>
          <section className="rounded-xl border border-border bg-surface p-4">
            <p className="mono-label">ตัวเลข</p>
            <Stats rows={stats} />
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="mono-label">แนะนำตัว</p>
          <Intro intro={intro} links={links} bioEditor={bioEditor} boundaries={profile.boundaries} />
          {extrasEditor}
          {stats.length > 0 ? (
            <div className="mt-4 border-t border-border pt-4">
              <Stats rows={stats} />
            </div>
          ) : null}
        </section>
      )}
      {profile.donation_url ? <SupportCard url={profile.donation_url} /> : null}
    </aside>
  );
}

function Intro({
  intro,
  links,
  bioEditor,
  boundaries,
}: {
  intro?: string | null;
  links: ProfileLink[];
  bioEditor?: React.ReactNode;
  boundaries?: string | null;
}) {
  return (
    <>
      {bioEditor ??
        (intro ? (
          <p className="mt-3 font-serif text-sm leading-loose whitespace-pre-wrap">{intro}</p>
        ) : (
          <p className="mt-3 text-sm text-text-muted">ยังไม่ได้เขียนแนะนำตัว</p>
        ))}
      {/* The writer's stated boundaries, finally rendered (the field existed
          all along) - visitors need it exactly here, beside who this is. */}
      {!bioEditor && boundaries ? (
        <p className="mt-3 rounded-md bg-surface-secondary/60 px-2.5 py-2 text-xs leading-relaxed text-text-secondary">
          <span className="font-medium text-text">ขอบเขต:</span> {boundaries}
        </p>
      ) : null}
      {links.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                rel="nofollow noopener ugc"
                target="_blank"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Icon name="external" size={15} />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** The website field and the writer's own links, as one list. */
function profileLinks(profile: PublicProfile): ProfileLink[] {
  const links = profile.website_url
    ? [{ label: "เว็บไซต์", url: profile.website_url }]
    : [];
  // Defaulted for the same reason the hero defaults open_for: a response from
  // an older API, or one still in the data cache, has no such field.
  return [...links, ...(profile.links ?? [])];
}

function statRows(profile: PublicProfile) {
  const rows: { label: string; value: string }[] = [];
  // A brand-new profile shows nothing rather than a column of zeroes: "0 เรื่อง
  // · 0 ผู้ติดตาม" reads as a verdict on a person who has just arrived.
  if (profile.novel_count > 0) {
    rows.push({ label: "ผลงาน", value: `${count(profile.novel_count)} เรื่อง` });
  }
  if (profile.follower_count > 0) {
    rows.push({ label: "ผู้ติดตาม", value: count(profile.follower_count) });
  }
  // Same reason a card hides a read count below a thousand (§12C).
  if (profile.total_views >= 1000) {
    rows.push({ label: "การอ่านรวม", value: count(profile.total_views) });
  }
  return rows;
}

function Stats({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="mt-3 flex flex-col gap-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 text-sm">
          <dt className="text-text-muted">{row.label}</dt>
          <dd className="tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The writer's own external support link (docs/MONETIZATION.md §6).
 *
 * FictionThai never handles this money, so the link is presented as leaving the
 * platform - `noopener` and `ugc` because the destination is user-supplied.
 */
function SupportCard({ url }: { url: string }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="mono-label">สนับสนุนนักเขียน</p>
      <p className="mt-2 text-sm text-text-secondary">
        ช่องทางสนับสนุนของนักเขียนเอง FictionThai ไม่เกี่ยวข้องกับการโอนเงิน
      </p>
      <a
        href={url}
        rel="nofollow noopener ugc"
        target="_blank"
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 text-sm text-text-secondary hover:border-secondary-300 hover:text-secondary-600"
      >
        <Icon name="external" size={15} />
        เปิดช่องทางสนับสนุน
      </a>
    </section>
  );
}
