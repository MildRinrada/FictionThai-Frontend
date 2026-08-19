"use client";

import { ApiError, del } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import { apiBase } from "@/lib/env";
import type { ApiData, ApiErrorResponse } from "@/types/api";
import type { MediaItem, MediaUploadPurpose } from "@/types/media";

/**
 * Browser-side media calls (docs/09 §27).
 *
 * Upload is the one call in the app that sends multipart form data, so it
 * uses fetch directly rather than the JSON helper - same credentials, same
 * CSRF double-submit header, same envelope and ApiError contract as
 * everything else (docs/11 §22).
 */

export interface UploadMediaInput {
  file: File;
  purpose: MediaUploadPurpose;
  /**
   * The fiction id or slug - required for "novel_cover" and "entry_image".
   * It is what the API authorizes the upload against, before a byte is stored.
   */
  novel?: string;
}

export async function uploadMedia(input: UploadMediaInput): Promise<MediaItem> {
  const form = new FormData();
  form.set("file", input.file);
  form.set("purpose", input.purpose);
  if (input.novel) {
    form.set("novel", input.novel);
  }

  const token = readCSRFToken();

  let response: Response;
  try {
    response = await fetch(`${apiBase}/media`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(token ? { "X-CSRF-Token": token } : {}),
      },
    });
  } catch {
    throw new ApiError(503, {
      code: "SERVICE_UNAVAILABLE",
      message: "Could not reach the API.",
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const error = (payload as ApiErrorResponse | undefined)?.error;
    throw new ApiError(
      response.status,
      error ?? { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    );
  }

  return (payload as ApiData<MediaItem>).data;
}

/** Idempotent on the server: deleting twice is still a 204 (docs/09 §33). */
export async function deleteMedia(id: string): Promise<void> {
  const token = readCSRFToken();
  await del(`/media/${encodeURIComponent(id)}`, {
    headers: token ? { "X-CSRF-Token": token } : {},
  });
}
