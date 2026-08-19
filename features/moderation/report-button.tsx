"use client";

import { useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api";
import { createReport } from "@/lib/moderation-client";
import {
  REPORT_DESCRIPTION_MAX_LENGTH,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetType,
} from "@/types/moderation";

/**
 * The report control (docs/02 §38: content → report → select reason →
 * optional description → submit → simple confirmation).
 *
 * It renders for guests too - reporting requires an account (docs/01 §21:
 * the reporter is part of the report), so a guest's submit routes to sign-in
 * with a return path rather than hiding the affordance (docs/02 §5.2).
 * The confirmation deliberately says nothing about what moderation will do
 * (docs/02 §38 "without exposing internal moderation details").
 */

export interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  /** Compact renders an icon-sized text button for comment rows. */
  compact?: boolean;
}

export function ReportButton({ targetType, targetId, compact }: ReportButtonProps) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setBusy(false);
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createReport({
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description.trim() || undefined,
      });
      // A 200 (already reported, still open) and a 201 both land here - for
      // the reporter the outcome is the same: it is in the queue.
      setDone(true);
      setOpen(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (cause instanceof ApiError && cause.isNotFound) {
        setError("ไม่พบเนื้อหานี้แล้ว");
      } else if (cause instanceof ApiError && cause.status === 422) {
        setError("ข้อมูลรายงานไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
      } else if (cause instanceof ApiError && cause.isRateLimited) {
        setError("ส่งรายงานถี่เกินไป กรุณารอสักครู่");
      } else {
        setError("ส่งรายงานไม่สำเร็จ กรุณาลองใหม่");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, description, reason, router, targetId, targetType]);

  if (done) {
    return (
      <span className="inline-flex min-h-9 items-center text-sm text-text-secondary" role="status">
        รายงานแล้ว ขอบคุณที่ช่วยดูแลชุมชน
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex min-h-9 items-center text-xs text-text-secondary underline-offset-2 hover:text-error hover:underline"
            : "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-text-secondary transition-colors hover:border-error hover:text-error"
        }
      >
        <span aria-hidden>⚑</span>
        <span>รายงาน</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={close}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
          >
            <h2 id={titleId} className="text-lg font-semibold text-text">
              รายงานเนื้อหา
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              เลือกเหตุผลที่ต้องการรายงาน ทีมดูแลจะตรวจสอบโดยเร็วที่สุด
            </p>

            <fieldset className="mt-4">
              <legend className="sr-only">เหตุผล</legend>
              <div className="flex flex-col gap-2">
                {REPORT_REASONS.map((value) => (
                  <label
                    key={value}
                    className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-text"
                  >
                    <input
                      type="radio"
                      name={`report-reason-${targetId}`}
                      value={value}
                      checked={reason === value}
                      onChange={() => setReason(value)}
                      className="accent-primary"
                    />
                    {REPORT_REASON_LABELS[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block text-sm text-text-secondary">
              รายละเอียดเพิ่มเติม (ไม่บังคับ)
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={REPORT_DESCRIPTION_MAX_LENGTH}
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </label>

            {error ? (
              <p className="mt-3 text-sm text-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="min-h-11 rounded-md border border-border px-4 text-sm text-text-secondary hover:bg-background"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="min-h-11 rounded-md bg-error px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "กำลังส่ง…" : "ส่งรายงาน"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
