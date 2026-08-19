/**
 * Uploaded media (docs/08 §22, docs/09 §27).
 *
 * The backend is the validation authority: it sniffs the actual bytes and
 * enforces the size cap. The constants here only pre-filter the file picker
 * so most mistakes fail before a network round trip.
 */

/** Upload purposes accepted today (docs/08 §22.1's vocabulary - the rest
 * arrive with their owning surfaces). */
export const MEDIA_UPLOAD_PURPOSES = [
  "avatar",
  "profile_banner",
  "novel_cover",
  "entry_image",
  "chapter_image",
  "character_avatar",
  // Staff-only: the home hero's slide art (docs/HOME-PROMO.md). The API
  // refuses it from anyone without the staff role.
  "promo_banner",
] as const;

export type MediaUploadPurpose = (typeof MEDIA_UPLOAD_PURPOSES)[number];

/** The server's image allowlist (JPEG/PNG/WebP - never SVG). */
export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp";

/** One media resource as the API returns it. */
export interface MediaItem {
  id: string;
  url: string;
  media_type: string;
  mime_type: string;
  size_bytes: number;
  original_filename?: string;
  created_at: string;
}
