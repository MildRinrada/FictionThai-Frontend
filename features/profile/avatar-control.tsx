"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { refreshProfileCache } from "@/app/settings/profile/actions";
import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/media-client";
import { MEDIA_ACCEPT } from "@/types/media";
import type { PublicProfile } from "@/types/profile";

/**
 * รูปโปรไฟล์ - changed ON the profile picture itself (owner's standing rule:
 * no settings page, no dialog, ever). Hovering the avatar shows a camera;
 * pressing it opens the file picker; the picked file uploads immediately and
 * the page shows the new picture. The same in-place pattern as the cover's
 * BannerControl, minus the crop surface - an avatar is a circle crop of the
 * middle, which is what the API stores.
 */
export function AvatarControl({ profile }: { profile: PublicProfile }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Purpose "avatar" attaches to the profile server-side the moment it
      // succeeds - no second save step to forget.
      await uploadMedia({ file, purpose: "avatar" });
      await refreshProfileCache(profile.username);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 413) {
        setError("ไฟล์ใหญ่เกินไป (สูงสุด 5 MB)");
      } else if (cause instanceof ApiError && cause.status === 422) {
        setError("รองรับเฉพาะ JPEG, PNG หรือ WebP");
      } else {
        setError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    // The classes mirror the hero's plain avatar exactly, so the owner's
    // profile lines up pixel-for-pixel with what a visitor sees.
    <span id="avatar" className="pointer-events-auto relative -mt-11 block size-22 scroll-mt-24 sm:-mt-12">
      <input
        ref={picker}
        type="file"
        accept={MEDIA_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void upload(file);
        }}
      />
      <button
        type="button"
        onClick={() => picker.current?.click()}
        disabled={busy}
        aria-label={profile.avatar_url ? "เปลี่ยนรูปโปรไฟล์" : "เพิ่มรูปโปรไฟล์"}
        title="เปลี่ยนรูปโปรไฟล์"
        className="group/avatar art-placeholder flex size-22 items-center justify-center overflow-hidden rounded-full border-4 border-background"
      >
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- own media route
          <img
            src={profile.avatar_url}
            alt=""
            className="size-full rounded-full object-cover"
          />
        ) : (
          <Icon name="user" size={30} className="text-text-muted" />
        )}
        {/* The camera, visible the moment the mouse arrives - and always
            visible while there is no picture yet, because an empty circle
            gives no hint that it is a door. */}
        <span
          className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white transition-opacity ${
            busy
              ? "opacity-100"
              : profile.avatar_url
                ? "opacity-0 group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100"
                : "bg-black/25 opacity-100"
          }`}
        >
          {busy ? (
            <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Icon name="camera" size={20} />
          )}
        </span>
      </button>
      {error ? (
        <span
          role="alert"
          className="absolute top-full start-0 mt-1 block w-44 text-xs text-error"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
