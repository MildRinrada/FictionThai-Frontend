"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { listNovels } from "@/lib/novels-client";
import { saveProfile } from "@/lib/profile-client";
import type { Novel } from "@/types/novel";
import type { PinnedWork } from "@/types/profile";

/**
 * ชั้นวางเรื่องที่ปักหมุด, the owner's editor
 * (docs/PROFILE-AND-ACHIEVEMENTS.md).
 *
 * Three slots, each a work of theirs plus one line in their own words. The
 * line is the whole point - "เริ่มที่เรื่องนี้", "อันนี้เขียนตอนอกหัก" - so it
 * gets a real field rather than being generated from a synopsis.
 */

const SLOTS = 3;

export function PinnedEditor({
  username,
  initialPinned,
}: {
  username: string;
  initialPinned: PinnedWork[];
}) {
  const [mine, setMine] = useState<Novel[] | null>(null);
  const [rows, setRows] = useState(() => pad(initialPinned));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listNovels({ author: username, per_page: 50 })
      .then((page) => alive && setMine(page.items))
      .catch(() => alive && setMine([]));
    return () => {
      alive = false;
    };
  }, [username]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveProfile({
        pinned: rows
          .filter((row) => row.novel_id !== "")
          .map((row) => ({ novel_id: row.novel_id, note: row.note })),
      });
      setSaved(true);
    } catch {
      setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap gap-2">
            <select
              value={row.novel_id}
              aria-label={`เรื่องที่ปักหมุดช่องที่ ${index + 1}`}
              onChange={(event) =>
                setRows(edit(rows, index, { novel_id: event.target.value }))
              }
              className="min-w-48 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— ไม่ปักหมุด —</option>
              {(mine ?? []).map((novel) => (
                <option key={novel.id} value={novel.id}>
                  {novel.title}
                </option>
              ))}
            </select>
            <input
              value={row.note}
              onChange={(event) => setRows(edit(rows, index, { note: event.target.value }))}
              placeholder="เช่น เริ่มที่เรื่องนี้"
              aria-label={`เหตุผลของช่องที่ ${index + 1}`}
              maxLength={80}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก…" : "บันทึกการปักหมุด"}
        </button>
        {saved ? (
          <span role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Icon name="check" size={15} />
            บันทึกแล้ว
          </span>
        ) : null}
      </div>
    </div>
  );
}

function pad(pinned: PinnedWork[]) {
  const rows = pinned
    .slice(0, SLOTS)
    .map((pin) => ({ novel_id: pin.novel_id, note: pin.note ?? "" }));
  while (rows.length < SLOTS) rows.push({ novel_id: "", note: "" });
  return rows;
}

function edit(
  rows: { novel_id: string; note: string }[],
  index: number,
  change: Partial<{ novel_id: string; note: string }>,
) {
  return rows.map((row, i) => (i === index ? { ...row, ...change } : row));
}
