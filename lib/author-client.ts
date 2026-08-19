"use client";

import { getOne, put } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { AuthorProfile } from "@/types/subscription";

/**
 * Browser-side author-profile calls (Phase 11).
 *
 * Currently just the EXTERNAL writer-support (EasyDonate) link. This is entirely
 * separate from Premium: FictionThai only stores and displays the URL and never
 * processes the donation (brief §6, §15). Self-scoped - the API always targets
 * the caller's own row.
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export async function getAuthorProfile(): Promise<AuthorProfile> {
  return getOne<AuthorProfile>("/me/author-profile");
}

/** Sets (a non-empty https URL) or clears (null) the caller's donation link. */
export async function setDonationURL(
  donationUrl: string | null,
): Promise<AuthorProfile> {
  return put<AuthorProfile>(
    "/me/author-profile",
    { donation_url: donationUrl },
    { headers: mutationHeaders() },
  );
}
