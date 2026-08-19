"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SaveBadge } from "@/components/ui/save-badge";
import { Icon } from "@/components/ui/icon";
import { scheduleLabel } from "@/lib/format";
import { listNovels, updateNovel } from "@/lib/novels-client";
import { useAutosave } from "@/lib/use-autosave";
import type { Novel } from "@/types/novel";

/**
 * การตีพิมพ์ (settings review 2026-08, item E).
 *
 * ซีรีส์ existed on the create form and then nowhere - a fiction created
 * outside a series could never join one, and a mis-typed series name could
 * never be fixed. The same picker the create form uses lives here now: the
 * writer's existing series come as options, so one series cannot end up
 * stored under three spellings.
 *
 * ตั้งเวลาเผยแพร่ is DELIBERATELY a pointer, not a duplicate control: the
 * schedule is set at the publish button on the overview because that is where
 * the pre-publish checklist gates it (13U). This block shows the schedule
 * when one exists so the settings page is never silent about it.
 */
export function PublishingSettings({
  novel,
  scheduled,
}: {
  novel: Novel;
  /** publish_at when it is still in the FUTURE, evaluated at request time by
      the server page - a client render must not consult the clock itself. */
  scheduled: string | null;
}) {
  const [seriesName, setSeriesName] = useState(novel.series_name ?? "");
  const [seriesPosition, setSeriesPosition] = useState(
    novel.series_position ? String(novel.series_position) : "",
  );
  const [options, setOptions] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);

  const username = novel.author?.username;

  useEffect(() => {
    // No username, no listing to ask for - null options already render as an
    // empty picker, so there is nothing to set.
    if (!username) return;
    let alive = true;
    listNovels({ author: username, per_page: 50 })
      .then((result) => {
        if (!alive) return;
        const names = new Set<string>();
        for (const entry of result.items) {
          if (entry.series_name) names.add(entry.series_name);
        }
        setOptions([...names].sort());
      })
      .catch(() => {
        if (alive) setOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [username]);

  const save = useCallback(
    async (value: { seriesName: string; seriesPosition: string }) => {
      const name = value.seriesName.trim();
      const position = Number.parseInt(value.seriesPosition, 10);
      await updateNovel(novel.slug, {
        series_name: name || null,
        series_position:
          name && Number.isFinite(position) && position > 0 ? position : null,
      });
    },
    [novel.slug],
  );
  const autosave = useAutosave({ seriesName, seriesPosition }, save);

  const known = options ?? [];
  const seriesIsKnown = !creating && (seriesName === "" || known.includes(seriesName));

  return (
    <section
      id="publishing"
      className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-lg font-semibold">การตีพิมพ์</h2>
        <SaveBadge state={autosave.state} error={autosave.error} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="series-pick" className="mono-label block">
            อยู่ในซีรีส์
          </label>
          <select
            id="series-pick"
            value={seriesIsKnown ? seriesName : "__new__"}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "__new__") {
                setCreating(true);
                setSeriesName("");
                return;
              }
              setCreating(false);
              setSeriesName(value);
              if (value === "") setSeriesPosition("");
            }}
            className="mt-2 min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="">ไม่อยู่ในซีรีส์</option>
            {known.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__new__">+ สร้างซีรีส์ใหม่…</option>
          </select>
          {!seriesIsKnown ? (
            <input
              aria-label="ชื่อซีรีส์ใหม่"
              autoFocus
              value={seriesName}
              onChange={(event) => setSeriesName(event.target.value)}
              placeholder="ชื่อซีรีส์"
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          ) : null}
        </div>

        <div>
          <label htmlFor="series-position" className="mono-label block">
            ลำดับในซีรีส์
          </label>
          <input
            id="series-position"
            type="number"
            min={1}
            value={seriesPosition}
            onChange={(event) => setSeriesPosition(event.target.value)}
            disabled={seriesName.trim() === ""}
            className="mt-2 min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm disabled:opacity-50"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        เรื่องในซีรีส์เดียวกันลิงก์ถึงกันบนหน้าเรื่อง และใช้คลังคำของผู้ช่วยเขียนร่วมกัน
      </p>

      {/* The schedule, stated - set where the checklist gates it. */}
      <div className="mt-5 border-t border-hairline pt-4">
        <p className="mono-label">ตั้งเวลาเผยแพร่</p>
        {scheduled ? (
          <p className="mt-2 flex items-start gap-2 text-sm text-text-secondary">
            <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-primary" />
            <span>
              เรื่องนี้ตั้งเวลาเผยแพร่ไว้: {scheduleLabel(scheduled)} -
              แก้หรือยกเลิกได้ที่{" "}
              <Link
                href={`/studio/novels/${encodeURIComponent(novel.slug)}`}
                className="text-primary hover:underline"
              >
                หน้าภาพรวม
              </Link>
            </span>
          </p>
        ) : (
          <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-text-muted">
            <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
            <span>
              ตั้งได้ที่ปุ่มเผยแพร่ใน{" "}
              <Link
                href={`/studio/novels/${encodeURIComponent(novel.slug)}`}
                className="text-primary hover:underline"
              >
                หน้าภาพรวม
              </Link>{" "}
              เมื่อเช็กลิสต์ก่อนเผยแพร่ครบ - อยู่ที่นั่นเพราะการตั้งเวลาคือการเผยแพร่แบบหนึ่ง
              ไม่ใช่การตั้งค่า
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
