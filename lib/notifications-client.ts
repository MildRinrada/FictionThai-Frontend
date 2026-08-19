"use client";

import { getMany, getOne, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type { Notification, UnreadCount } from "@/types/notifications";

/**
 * Browser-side notification calls (docs/09 §23).
 *
 * Everything here is the caller's own data - a 401 simply means "signed out"
 * and callers treat it as an empty state, never an error banner. Mutations
 * carry the CSRF double-submit header (docs/11 §22).
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/** The caller's notifications, newest first. */
export async function getNotifications(
  query: { page?: number } = {},
): Promise<{ items: Notification[]; meta: ApiMeta }> {
  return getMany<Notification>("/me/notifications", { query: { ...query } });
}

/** The badge count - one cheap indexed read (docs/08 §37). */
export async function getUnreadCount(): Promise<UnreadCount> {
  return getOne<UnreadCount>("/me/notifications/unread-count");
}

/** Idempotent: marking an already-read notification is still a success. */
export async function markNotificationRead(id: string): Promise<void> {
  await post(`/notifications/${encodeURIComponent(id)}/read`, undefined, {
    headers: mutationHeaders(),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await post("/me/notifications/read-all", undefined, {
    headers: mutationHeaders(),
  });
}
