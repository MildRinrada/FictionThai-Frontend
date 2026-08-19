"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { refreshProfileCache } from "@/app/settings/profile/actions";
import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { BANNER_HEIGHT, BANNER_WIDTH } from "@/lib/cover";
import { uploadMedia } from "@/lib/media-client";
import { MEDIA_ACCEPT } from "@/types/media";

/**
 * ภาพปกโปรไฟล์ - chosen, then positioned ON THE COVER ITSELF.
 *
 * No dialog. Press the camera, pick a file, and the cover you are looking at
 * becomes the thing you drag: same width, same height, the same crop a visitor
 * will get. A modal cannot do that - it shows a small proxy of the band and
 * asks the writer to trust that the real one will match.
 *
 * **The picture is locked to the band.** It is never allowed to be dragged off
 * its own edge: the smallest it can be is exactly covering, and the pan is
 * clamped to whatever overflow the zoom created. Without that clamp the band
 * showed the OLD cover through the gap beside the new one, which looked like
 * two pictures pasted together - and a writer could "position" a crop that was
 * half hole.
 *
 * What is stored is the CROP at `BANNER_WIDTH`×`BANNER_HEIGHT`, not the
 * original: a cover is a wide, shallow band that almost no photograph is shaped
 * like, and leaving the browser to take the middle is how a writer ends up with
 * a strip of somebody's shoulder.
 */

/** The largest the writer may magnify their own picture. */
const MAX_ZOOM = 3;

interface Size {
  w: number;
  h: number;
}

export function BannerControl({
  username,
}: {
  /** Whose cached profile to expire once the new cover lands. */
  username: string;
}) {
  const router = useRouter();

  const [picker, setPicker] = useState<HTMLInputElement | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const [source, setSource] = useState<string | null>(null);
  /** The band's painted size - measured, never assumed. */
  const [band, setBand] = useState<Size>({ w: 0, h: 0 });
  /** The picked file's own pixel size, known only once it has decoded. */
  const [natural, setNatural] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The object URL is the browser's, and it is ours to release.
  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source);
  }, [source]);

  // The band's width follows the page, so the crop maths must follow the band.
  useEffect(() => {
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setBand({ w: box.width, h: box.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame]);

  /**
   * How large the picture is drawn, in band pixels.
   *
   * The base is the "cover" scale - the smallest that still fills the band in
   * both directions - so zoom 1 is exactly full, never smaller.
   */
  const drawn = ((): Size => {
    if (!natural || band.w === 0) return { w: 0, h: 0 };
    const base = Math.max(band.w / natural.w, band.h / natural.h);
    return { w: natural.w * base * zoom, h: natural.h * base * zoom };
  })();

  /** The pan is only ever allowed as far as the overflow it has. */
  const limit = useCallback(
    (next: { x: number; y: number }, size: Size) => {
      const mx = Math.max(0, (size.w - band.w) / 2);
      const my = Math.max(0, (size.h - band.h) / 2);
      return {
        x: Math.min(mx, Math.max(-mx, next.x)),
        y: Math.min(my, Math.max(-my, next.y)),
      };
    },
    [band.w, band.h],
  );

  function reset() {
    setSource(null);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDrag(null);
    setError(null);
  }

  function choose(file: File | undefined) {
    if (!file) return;
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    setSource((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  }

  function rescale(next: number) {
    setZoom(next);
    if (!natural || band.w === 0) return;
    const base = Math.max(band.w / natural.w, band.h / natural.h);
    setOffset((current) =>
      limit(current, { w: natural.w * base * next, h: natural.h * base * next }),
    );
  }

  /**
   * Renders the visible part of the band and uploads THAT.
   *
   * The canvas is the band, scaled up to the stored size - the same rectangle,
   * so every number here is the preview's multiplied by one factor. Measuring
   * the REAL band rather than assuming a size is what makes the stored cover
   * identical to what the writer was looking at.
   */
  async function save() {
    if (!image || !natural || band.w === 0) return;

    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = BANNER_WIDTH;
      canvas.height = BANNER_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");

      const scale = BANNER_WIDTH / band.w;
      const width = drawn.w * scale;
      const height = drawn.h * scale;
      context.drawImage(
        image,
        (BANNER_WIDTH - width) / 2 + offset.x * scale,
        (BANNER_HEIGHT - height) / 2 + offset.y * scale,
        width,
        height,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("no blob");

      await uploadMedia({
        file: new File([blob], "banner.jpg", { type: "image/jpeg" }),
        purpose: "profile_banner",
      });
      // The profile is a shared cached response and the upload changed it
      // server-side; without this the writer refreshes, sees the old cover,
      // and concludes it failed.
      await refreshProfileCache(username);
      reset();
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 413) {
        setError("ไฟล์ใหญ่เกินไป (สูงสุด 5 MB)");
      } else if (cause instanceof ApiError && cause.status === 422) {
        setError("รองรับเฉพาะ JPEG, PNG หรือ WebP");
      } else {
        setError("อัปโหลดภาพปกไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={setPicker}
        type="file"
        accept={MEDIA_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          choose(file);
        }}
      />

      {source ? (
        // The cover itself becomes the editing surface: the writer drags the
        // real band, at its real size, and what they let go of is the crop.
        // It is OPAQUE - the cover underneath must not show through while a
        // new one is being placed, or the two read as one pasted-up picture.
        <div
          ref={setFrame}
          className="pointer-events-auto absolute inset-0 z-20 bg-surface-secondary"
        >
          <div
            className="absolute inset-0 cursor-move touch-none overflow-hidden select-none"
            onPointerDown={(event) => {
              setDrag({ x: event.clientX - offset.x, y: event.clientY - offset.y });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag) return;
              setOffset(
                limit({ x: event.clientX - drag.x, y: event.clientY - drag.y }, drawn),
              );
            }}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local
                object URL for a file that has not been uploaded yet. */}
            <img
              ref={setImage}
              src={source}
              alt="ภาพปกที่กำลังจัดตำแหน่ง"
              draggable={false}
              onLoad={(event) => {
                const element = event.currentTarget;
                setNatural({ w: element.naturalWidth, h: element.naturalHeight });
                setOffset({ x: 0, y: 0 });
              }}
              className="absolute top-1/2 left-1/2 max-w-none"
              style={{
                width: drawn.w || undefined,
                height: drawn.h || undefined,
                visibility: natural ? "visible" : "hidden",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          </div>

          {/* TOP of the band, not the bottom. The identity row below is raised
              above this whole band and its box reaches up into the cover's
              bottom edge, so a strip down there is painted over by the avatar
              and the page behind it. Up here nothing is above it. */}
          <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-black/45 px-3 py-2 backdrop-blur">
            <span className="text-xs text-white/90">ลากภาพเพื่อจัดตำแหน่ง</span>
            <label className="flex items-center gap-2 text-xs text-white/90">
              ย่อ / ขยาย
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => rescale(Number(event.target.value))}
                className="w-28 accent-white"
              />
            </label>
            <button
              type="button"
              onClick={() => picker?.click()}
              className="text-xs text-white/80 underline hover:text-white"
            >
              เลือกไฟล์อื่น
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="inline-flex min-h-8 items-center rounded-full border border-white/40 px-3 text-xs text-white hover:bg-white/10 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !natural}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Icon name="check" size={13} />
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>

          {error ? (
            <p
              role="alert"
              className="absolute inset-x-0 top-12 bg-error/90 px-3 py-1.5 text-center text-xs text-white"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        // The camera alone. A word printed across someone's cover is a caption
        // on their artwork, and a camera in the corner of a cover is already
        // the most-recognised control on the web.
        <button
          type="button"
          onClick={() => picker?.click()}
          className="pointer-events-auto absolute end-3 top-3 z-20 inline-flex size-9 items-center justify-center rounded-full border border-border bg-background/85 text-text-secondary opacity-80 backdrop-blur transition hover:border-primary-200 hover:text-text hover:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="camera" size={16} />
        </button>
      )}
    </>
  );
}
