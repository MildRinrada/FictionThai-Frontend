"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { SaveBadge } from "@/components/ui/save-badge";
import { ThemePicker } from "@/features/novels/create-extras";
import { updateNovel } from "@/lib/novels-client";
import { useAutosave } from "@/lib/use-autosave";
import type { Novel } from "@/types/novel";

/**
 * การแสดงผลบนหน้าเรื่อง (13U): the switches that shape the fiction's public
 * face - the counters, the spoiler cover, the accent colour.
 *
 * ปุ่มสนับสนุน is NOT here any more (settings review 2026-08, item F): it is
 * a money switch, so it lives with สิทธิ์และการสนับสนุน - "display" is how it
 * got flipped by someone adjusting a theme colour.
 *
 * Autosaves like every block on the page (item A), and the heading answers
 * with the shared SaveBadge - the old version saved silently, which reads as
 * not saving at all. The theme picker is the create form's own, names and
 * live preview included, instead of a private row of anonymous circles.
 */
export function DisplaySettings({ novel }: { novel: Novel }) {
  const router = useRouter();
  const [hideCounts, setHideCounts] = useState(novel.hide_counts ?? false);
  const [spoiler, setSpoiler] = useState(novel.content_warning_spoiler ?? false);
  const [themeColor, setThemeColor] = useState(novel.theme_color ?? "");

  const save = useCallback(
    async (value: { hideCounts: boolean; spoiler: boolean; themeColor: string }) => {
      await updateNovel(novel.slug, {
        hide_counts: value.hideCounts,
        content_warning_spoiler: value.spoiler,
        theme_color: value.themeColor || null,
      });
      router.refresh();
    },
    [novel.slug, router],
  );
  const autosave = useAutosave({ hideCounts, spoiler, themeColor }, save, 500);

  return (
    <section
      id="display"
      aria-labelledby="display-settings-heading"
      className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="display-settings-heading" className="font-serif text-lg font-semibold">
          การแสดงผลบนหน้าเรื่อง
        </h2>
        <SaveBadge state={autosave.state} error={autosave.error} />
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <label className="flex w-fit items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={hideCounts}
            onChange={(event) => setHideCounts(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            ซ่อนตัวเลขหัวใจ/ยอดอ่านจากผู้อ่าน
            <span className="mt-0.5 block text-xs text-text-muted">
              ระบบยังนับให้เหมือนเดิม คุณเห็นในสตูดิโอคนเดียว
            </span>
          </span>
        </label>

        <label className="flex w-fit items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={spoiler}
            onChange={(event) => setSpoiler(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            ซ่อนคำเตือนเนื้อหาไว้ใต้ปุ่มกันสปอยล์
            <span className="mt-0.5 block text-xs text-text-muted">
              ผู้อ่านกดเปิดดูเองก่อนเริ่มอ่าน
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5">
        <ThemePicker value={themeColor} onChange={setThemeColor} />
      </div>
    </section>
  );
}
