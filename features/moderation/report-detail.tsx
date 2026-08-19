"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ApiError } from "@/lib/api";
import {
  adminGetReport,
  adminPerformAction,
  adminUpdateReport,
} from "@/lib/moderation-client";
import {
  MODERATION_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  TARGET_TYPE_LABELS,
  type ModerationActionType,
  type ReportDetail,
} from "@/types/moderation";

/**
 * The staff report page (docs/02 §46): review content → choose action →
 * record moderation action → close the report.
 *
 * Everything here is enforced by the API - the buttons are affordances over
 * the documented lifecycle and action matrix, and a 409 from the server
 * (someone else acted first) is surfaced, never papered over.
 */

export function ReportDetailView({ reportId }: { reportId: string }) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "missing" | "error">(
    "loading",
  );
  const [action, setAction] = useState<string>("");
  const [actionReason, setActionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped after every mutation so the effect re-reads the truth from the API.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminGetReport(reportId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setAction((current) => current || (data.available_actions[0] ?? ""));
        setState("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && (cause.isForbidden || cause.isUnauthorized)) {
          setState("forbidden");
        } else if (cause instanceof ApiError && cause.isNotFound) {
          setState("missing");
        } else {
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, reloadKey]);

  const load = () => setReloadKey((current) => current + 1);

  const fail = (cause: unknown, fallback: string) => {
    if (cause instanceof ApiError && cause.status === 409) {
      setNotice("สถานะเปลี่ยนไปแล้ว (อาจมีผู้ดูแลคนอื่นดำเนินการ) - โหลดข้อมูลใหม่ให้แล้ว");
    } else {
      setNotice(fallback);
    }
  };

  const transition = async (status: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await adminUpdateReport(reportId, status);
    } catch (cause) {
      fail(cause, "เปลี่ยนสถานะรายงานไม่สำเร็จ");
    } finally {
      setBusy(false);
      load();
    }
  };

  const perform = async () => {
    if (busy || !detail || !action) return;
    setBusy(true);
    setNotice(null);
    try {
      await adminPerformAction({
        target_type: detail.report.target_type,
        target_id: detail.report.target_id,
        action,
        reason: actionReason.trim() || undefined,
      });
      setActionReason("");
      setNotice("บันทึกการดำเนินการแล้ว");
    } catch (cause) {
      fail(cause, "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
      load();
    }
  };

  if (state === "loading") {
    return (
      <p className="p-6 text-sm text-text-secondary" role="status">
        กำลังโหลด…
      </p>
    );
  }
  if (state === "forbidden") {
    return (
      <p className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
        หน้านี้สำหรับทีมดูแลเท่านั้น
      </p>
    );
  }
  if (state === "missing") {
    return (
      <p className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
        ไม่พบรายงานนี้
      </p>
    );
  }
  if (state === "error" || !detail) {
    return (
      <p className="rounded-md bg-error/10 p-4 text-sm text-error" role="alert">
        โหลดรายงานไม่สำเร็จ กรุณาลองใหม่
      </p>
    );
  }

  const { report, target, history } = detail;
  const open = report.status === "pending" || report.status === "reviewing";

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <p className="rounded-md bg-surface-secondary p-3 text-sm text-text" role="status">
          {notice}
        </p>
      ) : null}

      {/* The report itself */}
      <section aria-label="รายงาน" className="rounded-md border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
            {TARGET_TYPE_LABELS[report.target_type] ?? report.target_type}
          </span>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {REPORT_STATUS_LABELS[report.status]}
          </span>
          <span className="ml-auto text-xs text-text-muted">
            {new Date(report.created_at).toLocaleString("th-TH")}
          </span>
        </div>
        <h2 className="mt-3 text-lg font-semibold text-text">
          {REPORT_REASON_LABELS[report.reason] ?? report.reason}
        </h2>
        {report.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-text">{report.description}</p>
        ) : null}
        <p className="mt-3 text-xs text-text-secondary">
          รายงานโดย @{report.reporter.username}
          {report.resolver ? ` · ปิดโดย @${report.resolver.username}` : ""}
        </p>

        {open ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {report.status === "pending" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void transition("reviewing")}
                className="min-h-9 rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary hover:text-primary disabled:opacity-50"
              >
                รับเรื่องตรวจสอบ
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void transition("resolved")}
              className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              ปิดรายงาน - ดำเนินการแล้ว
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void transition("rejected")}
              className="min-h-9 rounded-md border border-border px-3 text-sm text-text-secondary hover:bg-background disabled:opacity-50"
            >
              ปิดรายงาน - ไม่ดำเนินการ
            </button>
          </div>
        ) : null}
      </section>

      {/* What it points at, right now */}
      <section aria-label="เนื้อหาที่ถูกรายงาน" className="rounded-md border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-text">เนื้อหาที่ถูกรายงาน</h3>
        {!target || !target.exists ? (
          <p className="mt-2 text-sm text-text-secondary">เนื้อหานี้ไม่อยู่ในระบบแล้ว</p>
        ) : (
          <div className="mt-2 flex flex-col gap-1 text-sm">
            {target.title ? <p className="font-medium text-text">{target.title}</p> : null}
            {target.excerpt ? (
              <blockquote className="rounded bg-surface-secondary p-3 text-text">
                {target.excerpt}
              </blockquote>
            ) : null}
            <p className="text-xs text-text-secondary">
              สถานะปัจจุบัน: <span className="font-medium">{target.state}</span>
              {target.author ? ` · โดย @${target.author.username}` : ""}
            </p>
          </div>
        )}

        {target?.exists ? (
          <div className="mt-4 border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-text">ดำเนินการ</h4>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={action}
                onChange={(event) => setAction(event.target.value)}
                aria-label="เลือกการดำเนินการ"
                className="min-h-9 rounded-md border border-border bg-background px-2 text-sm text-text"
              >
                {detail.available_actions.map((value) => (
                  <option key={value} value={value}>
                    {MODERATION_ACTION_LABELS[value as ModerationActionType] ?? value}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="เหตุผล (ไม่บังคับ)"
                className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-text"
              />
              <button
                type="button"
                disabled={busy || !action}
                onClick={() => void perform()}
                className="min-h-9 rounded-md bg-error px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                ดำเนินการ
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* The append-only audit trail for this target */}
      <section aria-label="ประวัติการดำเนินการ" className="rounded-md border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-text">ประวัติการดำเนินการกับเนื้อหานี้</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">ยังไม่มีการดำเนินการ</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-surface-secondary px-2 py-0.5 text-xs text-text">
                  {MODERATION_ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                <span className="text-text-secondary">โดย @{entry.moderator.username}</span>
                {entry.reason ? (
                  <span className="text-text-muted">- {entry.reason}</span>
                ) : null}
                <span className="ml-auto text-xs text-text-muted">
                  {new Date(entry.created_at).toLocaleString("th-TH")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-label="กลับ">
        <Link
          href="/admin/moderation"
          className="text-sm text-text-secondary hover:text-primary"
        >
          ← กลับไปที่คิวรายงาน
        </Link>
      </nav>
    </div>
  );
}
