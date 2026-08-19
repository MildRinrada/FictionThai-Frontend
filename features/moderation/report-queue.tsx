"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ApiError } from "@/lib/api";
import { adminGetReports } from "@/lib/moderation-client";
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  TARGET_TYPE_LABELS,
  type ModeratorReport,
  type ReportStatus,
} from "@/types/moderation";

/**
 * The moderator's report queue (docs/02 §38 "Moderator queue", docs/03 §28
 * /admin/moderation). Oldest first - a queue is worked in arrival order.
 *
 * The role check lives in the API: this island renders whatever the backend
 * allows and shows an access message on 403. Client-side role state is
 * presentation, never the boundary (docs/09 §29).
 */

const PAGE_SIZE_NOTE = 20;

export function ReportQueue() {
  const [status, setStatus] = useState<ReportStatus>("pending");
  const [reports, setReports] = useState<ModeratorReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");

  // The fetch lives in the effect as a promise chain (the codebase pattern
  // react-hooks/set-state-in-effect accepts); the "loading" flip happens in
  // the event handlers, and the initial state is already "loading".
  useEffect(() => {
    let cancelled = false;
    adminGetReports({ status, page })
      .then(({ items, meta }) => {
        if (cancelled) return;
        setReports(items);
        setTotal(meta.total);
        setState("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && (cause.isForbidden || cause.isUnauthorized)) {
          setState("forbidden");
          return;
        }
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [status, page]);

  if (state === "forbidden") {
    return (
      <p className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
        หน้านี้สำหรับทีมดูแลเท่านั้น
      </p>
    );
  }

  return (
    <section aria-label="คิวรายงาน">
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="สถานะรายงาน">
        {REPORT_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => {
              setState("loading");
              setStatus(value);
              setPage(1);
            }}
            className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${
              status === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-text-secondary hover:border-primary hover:text-primary"
            }`}
          >
            {REPORT_STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {state === "loading" ? (
        <p className="p-6 text-sm text-text-secondary" role="status">
          กำลังโหลด…
        </p>
      ) : null}

      {state === "error" ? (
        <p className="rounded-md bg-error/10 p-4 text-sm text-error" role="alert">
          โหลดคิวรายงานไม่สำเร็จ กรุณาลองใหม่
        </p>
      ) : null}

      {state === "ready" && reports.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
          ไม่มีรายงานในสถานะนี้
        </p>
      ) : null}

      {state === "ready" && reports.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                href={`/admin/moderation/reports/${report.id}`}
                className="block rounded-md border border-border bg-surface p-4 transition-colors hover:border-primary"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
                    {TARGET_TYPE_LABELS[report.target_type] ?? report.target_type}
                  </span>
                  <span className="font-medium text-text">
                    {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                  </span>
                  <span className="ml-auto text-xs text-text-muted">
                    {new Date(report.created_at).toLocaleString("th-TH")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  รายงานโดย @{report.reporter.username}
                  {report.description ? ` - ${report.description.slice(0, 120)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {state === "ready" && total > PAGE_SIZE_NOTE ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              setState("loading");
              setPage((current) => Math.max(1, current - 1));
            }}
            className="min-h-9 rounded-md border border-border px-3 text-text-secondary disabled:opacity-40"
          >
            ← ก่อนหน้า
          </button>
          <span className="text-text-muted">
            หน้า {page} · ทั้งหมด {total} รายการ
          </span>
          <button
            type="button"
            disabled={page * PAGE_SIZE_NOTE >= total}
            onClick={() => {
              setState("loading");
              setPage((current) => current + 1);
            }}
            className="min-h-9 rounded-md border border-border px-3 text-text-secondary disabled:opacity-40"
          >
            ถัดไป →
          </button>
        </div>
      ) : null}
    </section>
  );
}
