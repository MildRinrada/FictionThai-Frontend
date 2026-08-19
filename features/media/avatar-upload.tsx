"use client";

import { useState } from "react";

import { MediaUploadButton } from "@/features/media/media-upload-button";

/**
 * The signed-in user's avatar with its upload control (docs/08 §6.2
 * avatar_url; docs/08 §22 media_type "avatar"). The upload auto-attaches
 * server-side, so success here just means showing the new image.
 */

export function AvatarUpload({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);

  return (
    <div className="flex items-center gap-3">
      {url ? (
        // Media URLs are deployment-dependent API/CDN origins; the image
        // optimizer's fixed remote allowlist does not fit them yet.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="รูปโปรไฟล์ของคุณ"
          width={48}
          height={48}
          className="h-12 w-12 rounded-full border border-border object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-secondary text-lg text-text-muted"
        >
          ?
        </span>
      )}
      <MediaUploadButton
        purpose="avatar"
        label={url ? "เปลี่ยนรูปโปรไฟล์" : "เพิ่มรูปโปรไฟล์"}
        onUploaded={(item) => setUrl(item.url)}
      />
    </div>
  );
}
