"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  getMyAchievements,
  setAchievementsEnabled,
  setShowcase,
} from "@/lib/achievements-client";
import type { OwnerAchievement, OwnerAchievements } from "@/types/achievement";

/**
 * The owner's own achievement page
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 3).
 *
 * What it must and must not do:
 *
 *   * **No score.** Progress is per achievement. There is no total, no level,
 *     and nothing to compare against anybody.
 *   * **Eggs are counted, never listed** - except the ones this person already
 *     found, which show their trigger and message so they can tell someone.
 *   * **The off switch is real.** Off means nothing is counted and the profile
 *     shows no section at all - some writers find this sort of thing cheapens
 *     the work, and that view is respected in full.
 */

const FAMILY_LABEL: Record<string, string> = {
  path: "เส้นทาง",
  identity: "ตัวตน",
  egg: "ของลับที่เจอแล้ว",
};

export function AchievementManager() {
  const [view, setView] = useState<OwnerAchievements | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMyAchievements()
      .then((data) => alive && setView(data))
      .catch(() => alive && setError("โหลดไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!view) return <p className="text-sm text-text-muted">กำลังโหลด…</p>;

  const showcased = view.achievements
    .filter((item) => item.showcase_order !== undefined && item.showcase_order !== null)
    .sort((a, b) => (a.showcase_order ?? 0) - (b.showcase_order ?? 0))
    .map((item) => item.key);

  async function toggleSwitch(next: boolean) {
    setBusy(true);
    try {
      setView(await setAchievementsEnabled(next));
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleShowcase(item: OwnerAchievement) {
    if (!item.unlocked || !item.showcaseable) return;
    const next = showcased.includes(item.key)
      ? showcased.filter((key) => key !== item.key)
      : [...showcased, item.key];
    if (next.length > view!.showcase_max) return;
    setBusy(true);
    try {
      setView(await setShowcase(next));
      setError(null);
    } catch {
      setError("เลือกได้ไม่เกินที่กำหนด");
    } finally {
      setBusy(false);
    }
  }

  const byFamily = (family: string) =>
    view.achievements.filter((item) => item.family === family);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-sm font-medium">เปิดใช้เหรียญและความสำเร็จ</p>
          <p className="mt-1 text-xs text-text-secondary">
            ปิดแล้วระบบจะไม่นับอะไรเลย และโปรไฟล์จะไม่มีส่วนนี้
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={view.enabled}
          aria-label="เปิดใช้เหรียญและความสำเร็จ"
          disabled={busy}
          onClick={() => void toggleSwitch(!view.enabled)}
          className={`inline-flex min-h-9 items-center rounded-full border px-4 text-sm disabled:opacity-50 ${
            view.enabled
              ? "border-primary bg-primary-50 text-primary"
              : "border-border text-text-secondary"
          }`}
        >
          {view.enabled ? "เปิดอยู่" : "ปิดอยู่"}
        </button>
      </div>

      {view.enabled ? (
        <>
          <p className="mt-4 text-xs text-text-secondary">
            เลือกได้ {view.showcase_min}-{view.showcase_max} อันเพื่อโชว์บนโปรไฟล์ ·
            เลือกแล้ว {showcased.length}
          </p>

          {(["path", "identity", "egg"] as const).map((family) => {
            const items = byFamily(family);
            if (items.length === 0) return null;
            return (
              <section key={family} className="mt-5">
                <p className="mono-label">{FAMILY_LABEL[family]}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {items.map((item) => (
                    <li
                      key={item.key}
                      className={`rounded-lg border p-3 ${
                        item.unlocked ? "border-primary-200 bg-primary-50" : "border-border"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            <Icon
                              name={item.unlocked ? "sparkle" : "lock"}
                              size={14}
                              className={item.unlocked ? "text-primary" : "text-text-muted"}
                            />
                            {item.title}
                          </p>
                          {item.description ? (
                            <p className="mt-1 text-xs text-text-secondary">
                              {item.description}
                            </p>
                          ) : null}
                          {item.trigger ? (
                            <p className="mt-1 text-xs text-text-muted">
                              เจอจาก: {item.trigger}
                            </p>
                          ) : null}
                          {item.message ? (
                            <p className="mt-1 text-xs text-text-secondary italic">
                              “{item.message}”
                            </p>
                          ) : null}
                        </div>

                        {item.showcaseable && item.unlocked ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={showcased.includes(item.key)}
                            aria-label={`โชว์ ${item.title} บนโปรไฟล์`}
                            disabled={busy}
                            onClick={() => void toggleShowcase(item)}
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
                              showcased.includes(item.key)
                                ? "border-primary bg-primary text-white"
                                : "border-border text-text-secondary"
                            }`}
                          >
                            {showcased.includes(item.key) ? "โชว์อยู่" : "โชว์"}
                          </button>
                        ) : null}
                      </div>

                      {!item.unlocked && item.threshold > 1 ? (
                        <p className="mt-2 font-mono text-[11px] text-text-muted tabular-nums">
                          {item.count}/{item.threshold}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <p className="mt-5 rounded-lg border border-dashed border-border p-3 text-xs text-text-muted">
            ของลับ: เจอแล้ว {view.eggs.unlocked} / ?? · ที่ยังไม่เจอเราไม่บอกนะ
            บอกแล้วมันจะไม่สนุก
          </p>
        </>
      ) : null}
    </div>
  );
}
