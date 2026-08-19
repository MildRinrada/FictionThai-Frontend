import { Icon } from "@/components/ui/icon";
import type { PublicAchievements } from "@/types/achievement";

/**
 * เหรียญและความสำเร็จ, as a visitor sees it
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 3).
 *
 * Three rules are load-bearing here:
 *
 *   * **No egg is ever named.** Found ones are not in `showcase` and locked
 *     ones are a number - `ปลดล็อกแล้ว 3 / ??`. Describing one kills it.
 *   * **No score.** There is no total, no level, no comparison to anyone else.
 *     What is shown is what this person chose to show.
 *   * **Colour is never the only meaning** (the design system's accessibility
 *     rule): every locked slot carries an `sr-only` "ยังไม่ปลดล็อก".
 */

export function AchievementGrid({
  achievements,
  name,
  isOwner = false,
}: {
  achievements: PublicAchievements;
  name: string;
  isOwner?: boolean;
}) {
  // The owner switched the whole thing off: the section is absent, not empty.
  if (!achievements.enabled) return null;
  if (achievements.showcase.length === 0 && achievements.eggs.unlocked === 0) {
    return null;
  }

  // ONE locked slot at most (profile review 2026-08, section E): a row of
  // identical grey padlocks read as a broken page. One "next" keeps the
  // invitation without the wreckage.
  const lockedRemaining = Math.max(0, achievements.total - achievements.unlocked);

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="mono-label">เหรียญและความสำเร็จ</p>

      <ul className="mt-3 grid grid-cols-3 gap-2.5">
        {achievements.showcase.map((item) => (
          <li
            key={item.key}
            title={item.description ?? item.title}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 p-2.5 text-center"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-white">
              <Icon name="sparkle" size={16} />
            </span>
            <span className="text-[11px] leading-tight">{item.title}</span>
          </li>
        ))}

        {lockedRemaining > 0 ? (
          <li
            title="ยังมีเหรียญให้ปลดล็อกอีก"
            className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border p-2.5 text-center"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-surface-secondary text-text-muted">
              <Icon name="lock" size={15} />
            </span>
            <span className="text-[11px] leading-tight text-text-muted">
              <span aria-hidden>อีก {lockedRemaining} เหรียญ</span>
              <span className="sr-only">ยังไม่ปลดล็อกอีก {lockedRemaining} เหรียญ</span>
            </span>
          </li>
        ) : null}
      </ul>

      {/* Two facts on two lines (section E) - the old one-liner ran them
          together into a fraction nobody could parse. */}
      <p className="mt-3 text-xs text-text-muted tabular-nums">
        ปลดล็อกแล้ว {achievements.unlocked} / {achievements.total}
      </p>
      {achievements.eggs.unlocked > 0 ? (
        <p className="mt-0.5 text-xs text-text-muted tabular-nums">
          {/* The count and nothing else - that is the whole point of an egg. */}
          ของลับที่เจอ {achievements.eggs.unlocked}
        </p>
      ) : null}
      {isOwner ? (
        <p className="mt-2 text-[11px]">
          <a href="/settings/profile" className="text-primary hover:underline">
            เลือกเหรียญที่จะอวด หรือซ่อนทั้งบล็อก
          </a>
        </p>
      ) : null}
      <p className="sr-only">
        เหรียญของ {name} - แสดงเฉพาะที่เจ้าตัวเลือกไว้ ไม่มีคะแนนรวมและไม่มีการจัดอันดับ
      </p>
    </section>
  );
}
