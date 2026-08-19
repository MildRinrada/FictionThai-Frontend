import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { PageContainer } from "@/components/shell/page-container";
import { BANNER_ASPECT } from "@/lib/cover";
import { absoluteDate, count } from "@/lib/format";
import { OPEN_FOR_LABEL, profileName, type PublicProfile } from "@/types/profile";

/**
 * The identity band at the top of a profile.
 *
 * **Stacking.** The avatar overlaps the band above it, and the band must never
 * paint over the avatar. Both layers therefore declare their level explicitly -
 * `z-0` on the band, `z-10` on the identity row - inside an `isolate` wrapper
 * that gives them their own stacking context. Relying on document order alone
 * is what produced the prototype's bug: the band is positioned (it holds
 * absolutely-positioned children), and a positioned element paints over the
 * in-flow content that follows it, which is precisely the avatar the negative
 * margin pulled up.
 *
 * **The name and the handle are two different promises.** The heading is the
 * name the writer CHOSE - their pen name, or their display name - and it may
 * change. `@username` beneath it never does, which is why it stays in mono and
 * why the two must never render the same string twice
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
 *
 * **Roles are chips, not prose.** Reader/writer is a category; the join date is
 * a fact about the account. Running them together in one grey sentence made
 * both harder to read than either alone.
 *
 * **Only the avatar overlaps the cover.** The name used to be pulled up onto
 * the band with it, which read as type pasted onto a picture - and would be
 * unreadable the moment a writer uploads a busy cover. The avatar is a shape
 * with its own ring, so it can straddle the edge; text needs the page behind
 * it.
 */

export interface ProfileHeroProps {
  profile: PublicProfile;
  /** Owner controls, or the follow island for a visitor. */
  actions?: ReactNode;
  /**
   * The owner's cover control. It is rendered as a direct child of the band
   * and positions itself, because it expands to fill the band while the writer
   * is adjusting a picture.
   */
  bannerAction?: ReactNode;
  /**
   * The owner's in-place name editor (profile review 2026-08, section A).
   * When present it replaces the plain heading - the name is edited exactly
   * where everyone reads it.
   */
  nameEditor?: ReactNode;
  /**
   * The owner's in-place avatar control (owner's standing rule: pictures are
   * changed by pointing at them - a camera on hover, never a settings page or
   * a dialog). When present it replaces the plain avatar.
   */
  avatarEditor?: ReactNode;
}

export function ProfileHero({
  profile,
  actions,
  bannerAction,
  nameEditor,
  avatarEditor,
}: ProfileHeroProps) {
  const name = profileName(profile);
  const roles = [profile.is_author ? "นักเขียน" : null, "นักอ่าน"].filter(
    (role): role is string => role !== null,
  );
  // Other identities as quiet chips under the name (section D): pen names are
  // identity, not a collection, so they never earned a tab.
  const otherPenNames = (profile.pen_names ?? [])
    .map((pen) => pen.name)
    .filter((penName) => penName !== name);

  return (
    <PageContainer className="pt-6 pb-8">
      <div className="isolate">
        <div
          className={`group/cover relative z-0 ${BANNER_ASPECT} overflow-hidden rounded-xl border border-border bg-primary-50`}
        >
          {profile.banner_url ? (
            // Object storage has no configured image-optimizer loader, the same
            // reason avatars are plain <img>.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.banner_url} alt="" className="size-full object-cover" />
          ) : (
            <p className="mono-label absolute start-5 top-5 text-primary-400">
              FictionThai · โปรไฟล์
            </p>
          )}
          {/* The control is a DIRECT child of the band, deliberately. It used
              to sit in an `absolute end-3 top-3` wrapper, which pinned it to
              the top corner - and pinned the whole control to a corner-sized
              box. The moment the writer picked a file, the editing surface
              (`absolute inset-0`) resolved against that corner instead of the
              cover, so there was nothing to drag and the crop it exported came
              from a few pixels of the corner. The band is the positioning
              parent; the control places itself inside it. */}
          {bannerAction}
        </div>

        {/* `pointer-events-none` on the ROW, restored on its content.
            The avatar's negative margin collapses out to this row, so the row
            box starts ~48px ABOVE the cover's bottom edge - a full-width,
            invisible, raised (z-10) sheet lying across the bottom of the
            cover. Everything painted under there was unclickable: the cover
            control's own buttons sat in that strip and every press landed on
            this row instead. Only the row's CONTENT needs to take a pointer;
            the empty space beside the avatar never did. */}
        <div className="pointer-events-none relative z-10 px-2">
          {avatarEditor ?? (
            <span className="art-placeholder -mt-11 flex size-22 items-center justify-center overflow-hidden rounded-full border-4 border-background sm:-mt-12 sm:mb-0">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <Icon name="user" size={30} className="text-text-muted" />
              )}
            </span>
          )}

          <div className="pointer-events-auto mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              {nameEditor ?? (
                <h1 className="font-serif text-2xl leading-tight font-semibold tracking-tight sm:text-[29px]">
                  {name}
                </h1>
              )}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
                <span className="font-mono">@{profile.username}</span>
                {profile.joined_at ? (
                  <span>· เข้าร่วมเมื่อ {absoluteDate(profile.joined_at)}</span>
                ) : null}
              </p>

              {/* The one-line public record (profile review section G): what
                  there is, how much of it is FINISHED - the number a reader
                  decides by - and who already follows. Zeros stay silent. */}
              {profile.novel_count > 0 || profile.follower_count > 0 ? (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
                  {profile.novel_count > 0 ? (
                    <span className="tabular-nums">{count(profile.novel_count)} เรื่อง</span>
                  ) : null}
                  {(profile.completed_count ?? 0) > 0 ? (
                    <span className="font-medium text-text tabular-nums">
                      · จบแล้ว {count(profile.completed_count ?? 0)} เรื่อง
                    </span>
                  ) : null}
                  {profile.follower_count > 0 ? (
                    <span className="tabular-nums">
                      · ผู้ติดตาม {count(profile.follower_count)}
                    </span>
                  ) : null}
                </p>
              ) : null}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {roles.map((role) => (
                  <span
                    key={role}
                    // Where the badge comes from, said on the badge (profile
                    // review section A): nobody picks these.
                    title={
                      role === "นักเขียน"
                        ? "ป้ายอัตโนมัติ - ขึ้นเมื่อมีผลงานเผยแพร่"
                        : "ป้ายอัตโนมัติ - ทุกคนบน FictionThai เป็นนักอ่าน"
                    }
                    className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-text-secondary"
                  >
                    {role}
                  </span>
                ))}
                {/* Availability sits with the roles because it answers the same
                    question a visitor is asking: what is this person to me.
                    Defaulted because during a deploy an older API response - or
                    one still in the data cache - carries no such field. */}
                {(profile.open_for ?? []).map((kind) => (
                  <span
                    key={kind}
                    className="inline-flex items-center rounded-full border border-secondary-300 bg-secondary-50 px-2.5 py-0.5 text-xs text-secondary-600"
                  >
                    {OPEN_FOR_LABEL[kind]}
                  </span>
                ))}
                {otherPenNames.map((penName) => (
                  <span
                    key={penName}
                    title="นามปากกาอีกชื่อของคนเดียวกัน"
                    className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-text-muted"
                  >
                    {penName}
                  </span>
                ))}
              </div>
            </div>

            {/* Full-width rows on a phone (section H), a right-aligned cluster
                on anything wider. */}
            {actions ? (
              <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
