"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { deleteNovel, updateNovel } from "@/lib/novels-client";
import { Visibility } from "@/types/novel";

/**
 * โซนอันตราย (§13T).
 *
 * Until now there was no way to delete a fiction from the studio at all. Both
 * actions here follow the writer-first rule the rest of the studio lives by:
 * nothing happens without an explicit, separate confirmation, and the two are
 * deliberately different weights -
 *
 *   - เก็บเข้าคลัง is reversible and says so: visibility goes to ส่วนตัว,
 *     every chapter and reader stat survives, and publishing again undoes it.
 *
 *   - ลบเรื่อง requires the writer to TYPE THE TITLE. A title typed correctly
 *     is a decision; a second "แน่ใจหรือไม่" click is a reflex. The API
 *     soft-deletes (docs/08 §37), but the UI promises nothing about recovery -
 *     a promise the product has no restore button to keep.
 */
export function DangerZone({
  novelRef,
  title,
  visibility,
}: {
  novelRef: string;
  title: string;
  visibility: Visibility;
}) {
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    setArchiving(true);
    setError(null);
    try {
      await updateNovel(novelRef, { visibility: Visibility.Private });
      setConfirmArchive(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "เก็บเข้าคลังไม่สำเร็จ");
    } finally {
      setArchiving(false);
    }
  }

  async function destroy() {
    setDeleting(true);
    setError(null);
    try {
      await deleteNovel(novelRef);
      router.push("/studio");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ลบเรื่องไม่สำเร็จ");
      setDeleting(false);
    }
  }

  return (
    <section
      aria-labelledby="danger-heading"
      className="rounded-lg border border-error/25 p-4"
    >
      <p id="danger-heading" className="mono-label flex items-center gap-1.5 text-error">
        <Icon name="alert" size={14} />
        โซนอันตราย
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col divide-y divide-hairline">
        {/* เก็บเข้าคลัง - reversible, and stated as such. A story that is
            already private has nothing to archive, so the row does not appear
            at all: a control that only exists to say it cannot be used is
            space spent on nothing. */}
        {visibility !== Visibility.Private ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">เก็บเข้าคลัง</p>
              <p className="mt-0.5 text-xs text-text-muted">
                เรื่องกลับเป็นส่วนตัว ผู้อ่านไม่เห็นอีกจนกว่าจะเผยแพร่ใหม่ -
                ตอนและข้อมูลทุกอย่างยังอยู่ครบ
              </p>
            </div>
            {confirmArchive ? (
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  type="button"
                  disabled={archiving}
                  onClick={() => void archive()}
                  className="inline-flex min-h-9 items-center rounded-md border border-warning bg-warning/10 px-3.5 font-medium text-warning hover:bg-warning/20 disabled:opacity-50"
                >
                  {archiving ? "กำลังเก็บ…" : "ยืนยันเก็บเข้าคลัง"}
                </button>
                <button
                  type="button"
                  disabled={archiving}
                  onClick={() => setConfirmArchive(false)}
                  className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-text-secondary hover:text-text disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmArchive(true)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3.5 text-xs text-text-secondary hover:border-warning hover:text-warning"
              >
                <Icon name="library" size={14} />
                เก็บเข้าคลัง
              </button>
            )}
          </div>
        ) : null}

        {/* ลบเรื่อง - the typed title IS the confirmation. */}
        <div className="py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">ลบเรื่องนี้</p>
              <p className="mt-0.5 text-xs text-text-muted">
                เรื่องหายจากทุกหน้าและทุกคลังทันที รวมทั้งตอน คอมเมนต์ และสถิติ
              </p>
            </div>
            {!deleteOpen ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(true);
                  setTyped("");
                }}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-error/40 px-3.5 text-xs text-error hover:bg-error/10"
              >
                <Icon name="trash" size={14} />
                ลบเรื่อง
              </button>
            ) : null}
          </div>

          {deleteOpen ? (
            <div className="mt-3 rounded-md border border-error/30 bg-error/5 p-3">
              <label htmlFor="delete-confirm" className="block text-xs text-text-secondary">
                พิมพ์ชื่อเรื่อง <span className="font-semibold">{title}</span>{" "}
                เพื่อยืนยันการลบ
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="delete-confirm"
                  value={typed}
                  disabled={deleting}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={title}
                  className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-error"
                />
                <button
                  type="button"
                  disabled={typed.trim() !== title || deleting}
                  onClick={() => void destroy()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-error px-3.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="trash" size={13} />
                  {deleting ? "กำลังลบ…" : "ลบถาวร"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                  className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:text-text disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
