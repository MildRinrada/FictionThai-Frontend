"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { scheduleLabel } from "@/lib/format";
import { updateNovel } from "@/lib/novels-client";
import { Visibility } from "@/types/novel";

/**
 * The pending-schedule strip (13U): a fiction whose first publish is set for a
 * future moment. It replaces both the checklist (already passed - the gates
 * ran when the schedule was set) and the share panel (there is nothing to
 * share yet - readers get a 404 until the time).
 *
 * Cancelling returns the fiction to a private draft state, which also clears
 * the schedule server-side.
 */
export function ScheduledPublish({
  novelRef,
  publishAt,
}: {
  novelRef: string;
  publishAt: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await updateNovel(novelRef, {
        publish_at: null,
        visibility: Visibility.Private,
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ยกเลิกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="scheduled-publish-heading"
      className="rounded-lg border border-warning/30 bg-warning/8 p-4"
    >
      <p id="scheduled-publish-heading" className="mono-label flex items-center gap-1.5">
        <Icon name="clock" size={14} />
        ตั้งเวลาเผยแพร่ไว้แล้ว
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
        เรื่องจะขึ้นเว็บเอง <span className="font-medium text-text">{scheduleLabel(publishAt)}</span>{" "}
        - ก่อนหน้านั้นผู้อ่านยังไม่เห็น และคุณยังเขียนแก้ได้ตามปกติ
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-text-secondary">ยกเลิกการตั้งเวลา?</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancel()}
              className="inline-flex min-h-8 items-center rounded-md bg-warning px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "กำลังยกเลิก…" : "ยืนยัน - กลับเป็นส่วนตัว"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:text-text disabled:opacity-50"
            >
              เก็บเวลาเดิมไว้
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs text-text-secondary hover:border-warning hover:text-warning"
          >
            <Icon name="close" size={13} />
            ยกเลิกการตั้งเวลา
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
