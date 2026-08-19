"use client";

import { useEffect, useState } from "react";

import { MediaUploadButton } from "@/features/media/media-upload-button";
import { readCSRFToken } from "@/lib/auth-client";
import { COVER_ASPECT } from "@/lib/cover";
import { getNovel } from "@/lib/novels-client";

/**
 * The owner's cover control on the fiction page (docs/08 §7.1 cover_url;
 * docs/08 §22 media_type "novel_cover").
 *
 * The page is served from the public-first cache, so the server-rendered
 * `is_owner` is the GUEST view (docs/14 §7). When a session hint exists,
 * this island re-asks the API for the caller's own view after mount - the
 * PostActions pattern - and only reveals the control if the API says owner.
 * The backend enforces ownership regardless (docs/10 §27).
 */

export interface CoverUploadProps {
  novelRef: string;
  initialIsOwner: boolean;
}

export function CoverUpload({ novelRef, initialIsOwner }: CoverUploadProps) {
  const [isOwner, setIsOwner] = useState(initialIsOwner);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (initialIsOwner || !readCSRFToken()) return;
    let cancelled = false;
    getNovel(novelRef)
      .then((novel) => {
        if (!cancelled && novel.is_owner) setIsOwner(true);
      })
      .catch(() => {
        // Stay hidden; the server remains the authority.
      });
    return () => {
      cancelled = true;
    };
  }, [initialIsOwner, novelRef]);

  if (!isOwner) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      {uploadedUrl ? (
        // Shown inside the SAME box every card uses, so the writer sees the
        // crop rather than the whole file: a preview at the picture's own
        // shape promises a framing the shelf will never render.
        <span
          className={`block ${COVER_ASPECT} w-28 overflow-hidden rounded-md border border-border`}
        >
          {/* See avatar-upload: deployment-dependent media origins. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={uploadedUrl}
            alt="ปกใหม่ของนิยาย"
            className="size-full object-cover"
          />
        </span>
      ) : null}
      <MediaUploadButton
        purpose="novel_cover"
        novel={novelRef}
        label={uploadedUrl ? "เปลี่ยนปกอีกครั้ง" : "อัปโหลดปกนิยาย"}
        onUploaded={(item) => setUploadedUrl(item.url)}
      />
    </div>
  );
}
