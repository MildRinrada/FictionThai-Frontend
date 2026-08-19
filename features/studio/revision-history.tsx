"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import {
  listRevisions,
  restoreRevision,
  type ChapterRevision,
} from "@/lib/novels-client";

/**
 * ประวัติการแก้ไข (chat-editor review 2026-08, item 10).
 *
 * Every save has always recorded a snapshot (docs/CONTENT-MODEL.md §5); this
 * modal is the first place a writer can SEE them and bring one back. The
 * restore is non-destructive by construction: the server snapshots the current
 * state before writing, so the history list simply grows by one - which the
 * confirm text says in so many words.
 */
export function RevisionHistory({
  novelRef,
  chapterRef,
  onClose,
}: {
  novelRef: string;
  chapterRef: string;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<ChapterRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let alive = true;
    listRevisions(novelRef, chapterRef)
      .then((rows) => {
        if (alive) setRevisions(rows);
      })
      .catch(() => {
        if (alive) setError("โหลดประวัติไม่สำเร็จ ลองอีกครั้ง");
      });
    return () => {
      alive = false;
    };
  }, [novelRef, chapterRef]);

  async function restore(version: number) {
    setRestoring(true);
    setError(null);
    try {
      await restoreRevision(novelRef, chapterRef, version);
      // The whole chapter changed shape - a clean reload is the honest way to
      // show exactly what the server now holds.
      window.location.reload();
    } catch {
      setError("ย้อนคืนไม่สำเร็จ ลองอีกครั้ง");
      setRestoring(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-label="ประวัติการแก้ไข"
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-surface p-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">ประวัติการแก้ไข</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดประวัติการแก้ไข"
            className="text-text-secondary hover:text-text"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          ระบบเก็บฉบับก่อนหน้าไว้ทุกครั้งที่บันทึก -
          ย้อนคืนได้เสมอโดยฉบับปัจจุบันจะถูกเก็บเข้าประวัติก่อน ไม่มีอะไรหายไป
        </p>

        {error ? (
          <p role="alert" className="mt-3 rounded-md bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex-1 overflow-y-auto">
          {revisions === null && !error ? (
            <p className="py-6 text-center text-xs text-text-muted">กำลังโหลด…</p>
          ) : revisions !== null && revisions.length === 0 ? (
            <p className="py-6 text-center text-xs text-text-muted">
              ยังไม่มีประวัติ - จะเริ่มเก็บตั้งแต่การบันทึกครั้งถัดไป
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {(revisions ?? []).map((revision) => (
                <li
                  key={revision.version}
                  className="rounded-md border border-hairline px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-medium text-text">
                      เวอร์ชัน {count(revision.version)}
                    </span>
                    {revision.title ? (
                      <span className="max-w-40 truncate text-text-secondary">
                        {revision.title}
                      </span>
                    ) : null}
                    <span className="text-text-muted">
                      {revision.message_count > 0
                        ? `${count(revision.message_count)} ข้อความ`
                        : revision.entry_count > 0
                          ? `${count(revision.entry_count)} รายการ`
                          : `${count(revision.word_count)} คำ`}
                    </span>
                    <span className="text-text-muted">
                      {new Date(revision.created_at).toLocaleString("th-TH", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="ms-auto">
                      {confirming === revision.version ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={restoring}
                            onClick={() => void restore(revision.version)}
                            className="inline-flex min-h-7 items-center rounded-md bg-warning px-2.5 font-medium text-background hover:opacity-90 disabled:opacity-60"
                          >
                            {restoring ? "กำลังย้อนคืน…" : "ยืนยันย้อนคืน"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="text-text-secondary hover:text-text"
                          >
                            ยกเลิก
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirming(revision.version)}
                          className="inline-flex min-h-7 items-center gap-1 rounded-md border border-border px-2.5 text-text-secondary hover:border-primary-200 hover:text-text"
                        >
                          <Icon name="undo" size={12} />
                          ย้อนคืน
                        </button>
                      )}
                    </span>
                  </div>
                  {confirming === revision.version ? (
                    <p className="mt-1.5 text-[11px] text-warning">
                      เนื้อหาปัจจุบันจะถูกเก็บเป็นเวอร์ชันใหม่ในประวัติ
                      แล้วแทนที่ด้วยเวอร์ชัน {count(revision.version)} ทั้งตอน
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
