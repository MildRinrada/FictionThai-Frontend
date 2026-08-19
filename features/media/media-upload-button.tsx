"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/media-client";
import { MEDIA_ACCEPT, type MediaItem, type MediaUploadPurpose } from "@/types/media";

/**
 * The one upload control (docs/09 §27) - a labelled button over a hidden file
 * input. Deliberately plain: Phase 9 is functional foundation UI, not the
 * designed experience.
 *
 * The server is the validation authority (bytes are sniffed there); the
 * `accept` filter and the client-side messages only shorten the feedback
 * loop. A guest's attempt routes to sign-in with intent preserved
 * (docs/02 §5.2).
 */

export interface MediaUploadButtonProps {
  purpose: MediaUploadPurpose;
  /** The fiction id or slug - required when purpose is "novel_cover". */
  novel?: string;
  label: string;
  busyLabel?: string;
  onUploaded: (item: MediaItem) => void;
}

export function MediaUploadButton({
  purpose,
  novel,
  label,
  busyLabel = "กำลังอัปโหลด…",
  onUploaded,
}: MediaUploadButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const item = await uploadMedia({ file, purpose, novel });
      onUploaded(item);
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (cause instanceof ApiError && cause.status === 413) {
        setError("ไฟล์ใหญ่เกินไป (สูงสุด 5 MB)");
      } else if (cause instanceof ApiError && cause.status === 422) {
        setError("รองรับเฉพาะไฟล์ภาพ JPEG, PNG หรือ WebP");
      } else if (cause instanceof ApiError && cause.isRateLimited) {
        setError("อัปโหลดถี่เกินไป กรุณารอสักครู่");
      } else {
        setError("อัปโหลดไม่สำเร็จ กรุณาลองใหม่");
      }
    } finally {
      setBusy(false);
      // Allow re-selecting the same file after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT}
        className="sr-only"
        aria-label={label}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        {busy ? busyLabel : label}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
