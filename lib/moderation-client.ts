"use client";

import { getMany, getOne, patch, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type {
  ModerationAction,
  ModeratorReport,
  Report,
  ReportDetail,
} from "@/types/moderation";

/**
 * Browser-side report and moderation calls (docs/09 §28–§29).
 *
 * Everything here requires a signed-in caller; the staff endpoints
 * additionally require a moderator or admin role, which the API enforces -
 * client-side role checks are presentation only, never the security boundary
 * (docs/09 §29, docs/11 §43).
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

// ---------------------------------------------------------------------------
// User side (docs/09 §28)
// ---------------------------------------------------------------------------

/**
 * Files a report. The API answers 201 for a fresh report and 200 with the
 * existing report when one is already open on the same target - both resolve
 * here (docs/09 §34's idempotent-duplicate shape).
 */
export async function createReport(input: {
  target_type: string;
  target_id: string;
  reason: string;
  description?: string;
}): Promise<Report> {
  return post<Report>("/reports", input, { headers: mutationHeaders() });
}

export async function getMyReports(
  query: { page?: number } = {},
): Promise<{ items: Report[]; meta: ApiMeta }> {
  return getMany<Report>("/me/reports", { query: { ...query } });
}

// ---------------------------------------------------------------------------
// Staff side (docs/09 §29)
// ---------------------------------------------------------------------------

export async function adminGetReports(
  query: { status?: string; target_type?: string; page?: number } = {},
): Promise<{ items: ModeratorReport[]; meta: ApiMeta }> {
  return getMany<ModeratorReport>("/admin/reports", { query: { ...query } });
}

export async function adminGetReport(id: string): Promise<ReportDetail> {
  return getOne<ReportDetail>(`/admin/reports/${encodeURIComponent(id)}`);
}

/** Moves a report along the documented lifecycle (docs/08 §24.1). */
export async function adminUpdateReport(
  id: string,
  status: string,
): Promise<ModeratorReport> {
  return patch<ModeratorReport>(
    `/admin/reports/${encodeURIComponent(id)}`,
    { status },
    { headers: mutationHeaders() },
  );
}

/** Executes one moderation action and returns its audit record. */
export async function adminPerformAction(input: {
  target_type: string;
  target_id: string;
  action: string;
  reason?: string;
}): Promise<ModerationAction> {
  return post<ModerationAction>("/admin/moderation/actions", input, {
    headers: mutationHeaders(),
  });
}

export async function adminGetActions(
  query: { target_type?: string; target_id?: string; page?: number } = {},
): Promise<{ items: ModerationAction[]; meta: ApiMeta }> {
  return getMany<ModerationAction>("/admin/moderation/actions", {
    query: { ...query },
  });
}
