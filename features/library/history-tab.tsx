"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import {
  clearHistory,
  getHistory,
  setHistorySettings,
} from "@/lib/library-client";
import type { ApiMeta } from "@/types/api";
import type { HistoryEntry, HistorySettings } from "@/types/library";

import {
  EmptyState,
  NovelTitleLink,
  Pager,
  novelPath,
  totalPagesOf,
} from "@/features/library/shared";

/**
 * แท็บ "ประวัติการอ่าน" (library redesign 2026-08, section G): a timeline by
 * day, with the two privacy controls README requires front and centre -
 * ล้างประวัติ and the recording switch. History never has a public API; this
 * page is the only place it exists.
 */

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function HistoryTab({
  initial,
  initialMeta,
  settings,
  notify,
}: {
  initial: HistoryEntry[];
  initialMeta: ApiMeta | null;
  settings: HistorySettings | null;
  notify: (message: string, undo?: () => void) => void;
}) {
  const [entries, setEntries] = useState(initial);
  const [meta, setMeta] = useState(initialMeta);
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(settings?.record_history ?? true);
  const [confirming, setConfirming] = useState(false);

  async function goPage(next: number) {
    try {
      const result = await getHistory({ page: next });
      setEntries(result.items);
      setMeta(result.meta);
      setPage(next);
    } catch {
      notify("โหลดหน้าไม่สำเร็จ ลองอีกครั้ง");
    }
  }

  function toggleRecording() {
    const next = !recording;
    setRecording(next);
    void setHistorySettings(next);
    notify(
      next
        ? "เปิดการบันทึกประวัติแล้ว"
        : "ปิดการบันทึกประวัติแล้ว - การอ่านต่อจากนี้จะไม่ถูกจดไว้",
    );
  }

  function wipe() {
    setEntries([]);
    setMeta(null);
    setConfirming(false);
    void clearHistory();
    notify("ล้างประวัติการอ่านทั้งหมดแล้ว");
  }

  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.read_at);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return (
    <div>
      {/* The privacy bar stays visible whether or not there are rows. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            role="switch"
            checked={!recording}
            onChange={toggleRecording}
            aria-label="ไม่บันทึกประวัติการอ่าน"
            className="size-4 accent-primary"
          />
          ไม่บันทึกประวัติการอ่าน
        </label>
        <span className="text-text-muted">
          ประวัติเห็นคนเดียวเสมอ ไม่มีทางเข้าสาธารณะ - เหมาะกับการอ่านที่อยากเก็บเป็นส่วนตัว
        </span>
        {entries.length > 0 ? (
          confirming ? (
            <span className="ms-auto flex items-center gap-2">
              <span className="text-warning">ล้างทั้งหมด กู้คืนไม่ได้ - ยืนยัน?</span>
              <button
                type="button"
                onClick={wipe}
                className="inline-flex min-h-7 items-center rounded-md bg-error px-2.5 font-medium text-white hover:opacity-90"
              >
                ล้างประวัติ
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-text-secondary hover:text-text"
              >
                ยกเลิก
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ms-auto inline-flex min-h-7 items-center gap-1 rounded-md border border-border px-2.5 text-text-secondary hover:border-error hover:text-error"
            >
              <Icon name="trash" size={12} />
              ล้างประวัติ
            </button>
          )
        ) : null}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon="clock"
          title="ยังไม่มีประวัติการอ่าน"
          body={
            recording
              ? "เปิดอ่านตอนไหน ระบบจะจดไว้ให้ย้อนดูได้ที่นี่"
              : "การบันทึกประวัติปิดอยู่ - เปิดสวิตช์ด้านบนเมื่อพร้อม"
          }
        />
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {[...groups.entries()].map(([day, rows]) => (
            <section key={day} aria-label={day}>
              <h2 className="text-sm font-medium text-text-secondary">{day}</h2>
              <ol className="mt-1.5 flex flex-col">
                {rows.map((entry, at) => (
                  <li
                    key={`${entry.novel.id}-${entry.chapter?.id ?? at}`}
                    className="flex items-center gap-3 border-s-2 border-hairline py-1.5 ps-3"
                  >
                    <span className="w-12 shrink-0 text-[11px] text-text-muted tabular-nums">
                      {new Date(entry.read_at).toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <NovelTitleLink novel={entry.novel} />
                        {entry.chapter ? (
                          <Link
                            href={`/read/${encodeURIComponent(entry.novel.slug)}/${encodeURIComponent(entry.chapter.slug)}`}
                            className="text-xs text-text-secondary hover:text-primary"
                          >
                            ตอนที่ {count(entry.chapter.chapter_number)}
                            {entry.chapter.title ? ` · ${entry.chapter.title}` : ""}
                          </Link>
                        ) : null}
                      </span>
                    </div>
                    <Link
                      href={
                        entry.chapter
                          ? `/read/${encodeURIComponent(entry.novel.slug)}/${encodeURIComponent(entry.chapter.slug)}`
                          : novelPath(entry.novel)
                      }
                      className="shrink-0 text-xs text-text-secondary hover:text-primary"
                    >
                      เปิดอ่าน
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <Pager
            page={page}
            totalPages={totalPagesOf(meta)}
            onPage={(next) => void goPage(next)}
          />
        </div>
      )}
    </div>
  );
}
