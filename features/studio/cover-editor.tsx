"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/media-client";
import { updateNovel } from "@/lib/novels-client";
import { COVER_ASPECT, COVER_HEIGHT, COVER_WIDTH } from "@/lib/cover";
import { MEDIA_ACCEPT } from "@/types/media";

/**
 * ปกเรื่อง - the cover, edited where it is shown (§13S).
 *
 * ONE click, and outside the settings page it NAVIGATES (cover review
 * 2026-08): the modal opening from both the overview and the settings meant
 * two surfaces claiming to be "the" cover editor, and nobody could say why.
 * With `editHref` set, a cover that exists links to ตั้งค่าเรื่อง › ชื่อเรื่อง
 * และปก - one home for editing.
 *
 * The EXCEPTION is a fiction with no cover yet: that click opens the crop
 * dialog directly wherever it happens, because adding the missing cover is
 * fulfilling what the checklist is asking for, not editing a decision.
 *
 * The modal exists for one reason - covers have a shape. A cover is displayed
 * at `COVER_ASPECT` everywhere on this platform, and an upload of any other
 * shape used to be cropped by the browser at render time, differently in every
 * place it appeared, with the author never seeing where the crop fell. Choosing
 * the crop is the author's decision, so it is made here, once, before a byte is
 * stored.
 *
 * What is uploaded is the CROPPED image at the target size, not the original:
 * the platform stores what the author chose to show.
 */

/** The shape every cover is displayed at - A5, from lib/cover.ts. */
const ASPECT = COVER_WIDTH / COVER_HEIGHT;

/** Exported at A5 300 DPI exactly, so a print-ready cover survives intact. */
const OUTPUT_WIDTH = COVER_WIDTH;
const OUTPUT_HEIGHT = COVER_HEIGHT;

/** The frame the writer drags inside, in CSS pixels. */
const FRAME_WIDTH = 260;
const FRAME_HEIGHT = Math.round(FRAME_WIDTH / ASPECT);

export function CoverEditor({
  novelRef,
  coverURL,
  className = "w-40",
  editHref,
  actions = false,
}: {
  novelRef: string;
  coverURL: string | null;
  className?: string;
  /**
   * When set and a cover EXISTS, a click navigates here - the settings
   * page's own cover block - instead of opening a second modal surface.
   * A missing cover still opens the dialog in place (see the header note).
   */
  editHref?: string;
  /**
   * Real buttons under the frame - เปลี่ยนปก and ลบปก - for the settings
   * page, where the cover is being MANAGED rather than glanced at. Removal
   * is two presses on purpose, and reversible only by re-uploading, so the
   * second press says exactly that.
   */
  actions?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(coverURL);
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function removeCover() {
    setRemoving(true);
    setRemoveError(null);
    try {
      // Clearing, not deleting content: the novels update accepts an empty
      // cover_url, and every card falls back to its titled placeholder.
      await updateNovel(novelRef, { cover_url: "" });
      setCurrent(null);
      setConfirmRemove(false);
      router.refresh();
    } catch (cause) {
      setRemoveError(cause instanceof ApiError ? cause.message : "ลบปกไม่สำเร็จ");
    } finally {
      setRemoving(false);
    }
  }

  const frame = `group relative block ${COVER_ASPECT} self-start overflow-hidden rounded-md border border-border ${className}`;

  /*
    The hover state is an ICON, not a sentence. A cover is small - 56px wide
    in the studio rail - and a line of Thai text laid over it is unreadable at
    that size and covers the picture it is describing. The icon says "change
    this" at any size; which icon says WHERE: the pencil means "this opens the
    settings", the camera means "this opens the picker right here".
  */
  const overlay = (icon: "camera" | "edit") => (
    <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      <span className="flex size-8 items-center justify-center rounded-full bg-white/95 text-text shadow">
        <Icon name={icon} size={16} />
      </span>
    </span>
  );

  if (editHref && current) {
    return (
      <Link
        href={editHref}
        title="เปลี่ยนปกได้ที่ตั้งค่าเรื่อง"
        aria-label="เปลี่ยนปกในตั้งค่าเรื่อง"
        className={frame}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an immutable
            URL from our own media route; next/image would add a proxy hop for
            a control that never reaches a reader. */}
        <img src={current} alt="ปกของเรื่องนี้" className="size-full object-cover" />
        {overlay("edit")}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={current ? "คลิกเพื่อเปลี่ยนปก" : "คลิกเพื่อเพิ่มปก"}
        aria-label={current ? "เปลี่ยนปกเรื่อง" : "เพิ่มปกเรื่อง"}
        className={frame}
      >
        {current ? (
          /* eslint-disable-next-line @next/next/no-img-element -- an immutable
             URL from our own media route; next/image would add a proxy hop for
             a control that never reaches a reader. */
          <img src={current} alt="ปกของเรื่องนี้" className="size-full object-cover" />
        ) : (
          // An INVITATION, not a status ("ยังไม่มีปก" said the same thing and
          // did nothing about it) - this is the one thing the checklist is
          // asking for, so the frame itself offers the fix.
          <span className="flex size-full flex-col items-center justify-center gap-1.5 bg-surface-secondary text-xs text-text-muted">
            <Icon name="plus" size={20} />
            เพิ่มปก
          </span>
        )}

        {overlay("camera")}
      </button>

      {actions ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-8 items-center rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:bg-surface-secondary hover:text-text"
            >
              {current ? "เปลี่ยนปก" : "เพิ่มปก"}
            </button>
            {current && !confirmRemove ? (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="inline-flex min-h-8 items-center rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-error/50 hover:bg-error/5 hover:text-error"
              >
                ลบปก
              </button>
            ) : null}
          </div>

          {confirmRemove ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-text-muted">
                เอากลับมาได้ด้วยการอัปโหลดใหม่เท่านั้น
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void removeCover()}
                  disabled={removing}
                  className="inline-flex min-h-8 items-center rounded-md border border-error/50 px-2.5 text-xs font-medium text-error hover:bg-error/10 disabled:opacity-50"
                >
                  {removing ? "กำลังลบ…" : "ยืนยันลบปก"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  disabled={removing}
                  className="inline-flex min-h-8 items-center rounded-md border border-border px-2.5 text-xs text-text-secondary"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : null}

          {removeError ? (
            <p role="alert" className="text-xs text-error">
              {removeError}
            </p>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <CoverModal
          novelRef={novelRef}
          onClose={() => setOpen(false)}
          onSaved={(url) => {
            setCurrent(url);
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function CoverModal({
  novelRef,
  onClose,
  onSaved,
}: {
  novelRef: string;
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Esc closes, like every other dismissible surface.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The object URL is the browser's, and it is ours to release.
  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source);
    };
  }, [source]);

  const pick = useCallback((file: File | undefined) => {
    if (!file) return;
    setError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSource((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  }, []);

  /**
   * Renders the visible part of the frame to a canvas and uploads it.
   *
   * The maths is the inverse of what the preview does: the image is drawn at
   * `cover` scale times the writer's zoom, offset by their drag, and the frame
   * is the window onto it. Exporting the same transform at the output size is
   * what makes the result identical to what they were looking at.
   */
  async function save() {
    const element = image.current;
    if (!element || !element.naturalWidth) return;

    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");

      const scale = OUTPUT_WIDTH / FRAME_WIDTH;
      const base = Math.max(
        FRAME_WIDTH / element.naturalWidth,
        FRAME_HEIGHT / element.naturalHeight,
      );
      const drawn = base * zoom * scale;
      const width = element.naturalWidth * drawn;
      const height = element.naturalHeight * drawn;

      context.drawImage(
        element,
        (OUTPUT_WIDTH - width) / 2 + offset.x * scale,
        (OUTPUT_HEIGHT - height) / 2 + offset.y * scale,
        width,
        height,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("no blob");

      const media = await uploadMedia({
        file: new File([blob], "cover.jpg", { type: "image/jpeg" }),
        purpose: "novel_cover",
        novel: novelRef,
      });
      onSaved(media.url);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "อัปโหลดปกไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="เปลี่ยนปกเรื่อง"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg font-semibold">ปกเรื่อง</h2>
            {/*
              The guidance goes BEFORE the file picker, not after the upload
              fails. A writer who learns the shape from an error message has
              already chosen the wrong file.
            */}
            <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
              <li>
                · ขนาดมาตรฐาน A5 ที่ 300 DPI - {OUTPUT_WIDTH}×{OUTPUT_HEIGHT} พิกเซล
              </li>
              <li>· ไฟล์ JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB</li>
              <li>· ตัวหนังสือบนปกอย่าชิดขอบ การ์ดบางที่ตัดขอบเล็กน้อย</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 text-text-muted hover:text-text"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <input
          ref={picker}
          type="file"
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        {source === null ? (
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="mt-5 flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-text-secondary hover:border-primary hover:text-primary"
          >
            <Icon name="image" size={26} />
            เลือกไฟล์ภาพจากเครื่อง
          </button>
        ) : (
          <div className="mt-5">
            {/*
              Drag to move, slider to zoom. The frame is the crop: everything
              outside it is dimmed rather than hidden, so a writer can see what
              they are cutting off.
            */}
            <div
              className="relative mx-auto cursor-move overflow-hidden rounded-md border border-border bg-surface-secondary select-none"
              style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
              onPointerDown={(event) => {
                drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                setOffset({
                  x: event.clientX - drag.current.x,
                  y: event.clientY - drag.current.y,
                });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local
                  object URL for a file that has not been uploaded yet. */}
              <img
                ref={image}
                src={source}
                alt="ตัวอย่างปกที่กำลังจัดตำแหน่ง"
                draggable={false}
                className="absolute top-1/2 left-1/2 max-w-none"
                style={{
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  // `cover` at scale 1, so the frame is always full at the
                  // start and the writer only ever zooms IN.
                  width: FRAME_WIDTH,
                  height: FRAME_HEIGHT,
                  objectFit: "cover",
                }}
              />
            </div>

            <label className="mt-4 flex items-center gap-3 text-xs text-text-secondary">
              ย่อ / ขยาย
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="flex-1 accent-primary"
              />
            </label>

            <button
              type="button"
              onClick={() => picker.current?.click()}
              className="mt-2 text-xs text-primary hover:underline"
            >
              เลือกไฟล์อื่น
            </button>
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:text-text disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || source === null}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="check" size={15} />
            {busy ? "กำลังอัปโหลด…" : "ใช้ปกนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
