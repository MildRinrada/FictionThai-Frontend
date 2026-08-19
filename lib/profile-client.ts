"use client";

import { patch } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { OpenFor, ProfileLink, PublicProfile } from "@/types/profile";

/**
 * Browser-side profile editing (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
 *
 * Self-scoped: the endpoint takes no reference at all and always writes the
 * caller's own row. The response is the PUBLIC view of the result, so the
 * settings screen shows the writer exactly what a visitor will see rather than
 * a private echo of what they typed.
 */

/** A partial edit. Omit a field to leave it alone; send "" to clear it. */
export interface ProfileEdit {
  display_name?: string;
  bio?: string;
  website_url?: string;
  links?: ProfileLink[];
  open_for?: OpenFor[];
  /** คำเตือน/ขอบเขตของนักเขียน - free text; "" withdraws the notice. */
  boundaries?: string;
  /** The profile wall's on/off switch. Omit to leave it as it is. */
  wall_enabled?: boolean;
  /** อันดับนักเขียน opt-out (docs/WRITER-SPOTLIGHT.md). Omit to leave it. */
  hide_from_rankings?: boolean;
  /** Up to three works to lead with. Send [] to clear the shelf. */
  pinned?: { novel_id: string; note: string }[];
}

export async function saveProfile(edit: ProfileEdit): Promise<PublicProfile> {
  const token = readCSRFToken();
  return patch<PublicProfile>("/me/profile", edit, {
    headers: token ? { "X-CSRF-Token": token } : {},
  });
}
