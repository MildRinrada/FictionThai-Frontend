"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Visibility } from "@/types/novel";
import { COVER_ASPECT } from "@/lib/cover";

/**
 * แชร์เรื่องนี้ (§13T).
 *
 * The answer to "แล้วยังไงต่อ" once the story is out: the reader link, a copy
 * button, and the card strangers will actually see - rendered from the
 * fiction's real cover, title, and tagline, so a missing tagline is discovered
 * HERE and not on someone else's feed.
 *
 * Until there is a real link the panel renders NOTHING. It used to render a
 * disabled box explaining that sharing was unavailable - a panel whose whole
 * content was that it could not be used, and one more surface repeating the
 * visibility state the checklist already owns.
 *
 * The link is composed from `location.origin` at click time and goes through
 * the clipboard - nothing here posts anywhere on the writer's behalf.
 * navigator.share is used when the platform has it and quietly falls back to
 * copying when it does not.
 */

const AUDIENCE_NOTES: Partial<Record<Visibility, string>> = {
  [Visibility.Public]: "ใครก็เปิดอ่านได้ ไม่ต้องสมัคร",
  [Visibility.Members]: "คนที่เปิดลิงก์ต้องล็อกอินก่อนถึงจะอ่านได้",
  [Visibility.Followers]: "เปิดได้เฉพาะคนที่ติดตามคุณ",
  [Visibility.Unlisted]: "เปิดได้เฉพาะคนที่มีลิงก์นี้ - เรื่องไม่ขึ้นหน้ารวม",
};

export function SharePanel({
  slug,
  title,
  tagline,
  coverURL,
  authorName,
  visibility,
}: {
  slug: string;
  title: string;
  tagline?: string;
  coverURL?: string | null;
  authorName: string;
  visibility: Visibility;
}) {
  const [copied, setCopied] = useState(false);
  const path = `/novel/${encodeURIComponent(slug)}`;
  const shareable = visibility !== Visibility.Private;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
    } catch {
      // Clipboard refused (permissions, insecure context). The URL is visible
      // in the panel either way; nothing to do but not claim success.
    }
  }

  async function share() {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: tagline || title, url });
        return;
      } catch {
        // Cancelled or unsupported target - fall through to the clipboard.
      }
    }
    await copyLink();
  }

  // No link yet, no panel - see the header comment.
  if (!shareable) return null;

  return (
    <section
      aria-labelledby="share-heading"
      className="rounded-lg border border-success/30 bg-success/5 p-4"
    >
      <p id="share-heading" className="mono-label flex items-center gap-1.5">
        <Icon name="check" size={14} />
        เรื่องนี้ออนไลน์แล้ว
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-3 font-mono text-xs text-text-secondary hover:border-primary-200 hover:text-text"
        >
          <Icon name="link" size={13} className="shrink-0" />
          <span className="truncate">{path}</span>
          <Icon name="external" size={12} className="shrink-0 opacity-60" />
        </a>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-medium text-white hover:opacity-90"
        >
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
        >
          <Icon name="share" size={13} />
          แชร์
        </button>
      </div>

      {AUDIENCE_NOTES[visibility] ? (
        <p className="mt-2 text-xs text-text-muted">{AUDIENCE_NOTES[visibility]}</p>
      ) : null}

      {/* The card a stranger meets. Rendered from the same fields the real
          listings use, so what is missing here is missing there too. */}
      <div
        aria-label="ตัวอย่างการ์ดที่คนอื่นจะเห็น"
        className="mt-3.5 flex max-w-md gap-3 rounded-md border border-border bg-surface p-3"
      >
        {coverURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview of an already-optimised upload
          <img
            src={coverURL}
            alt=""
            className={`${COVER_ASPECT} w-12 shrink-0 rounded-sm object-cover`}
          />
        ) : (
          <span className={`flex ${COVER_ASPECT} w-12 shrink-0 items-center justify-center rounded-sm bg-surface-secondary text-text-muted`}>
            <Icon name="book" size={16} />
          </span>
        )}
        <span className="min-w-0 self-center">
          <span className="block truncate font-serif text-sm font-semibold">{title}</span>
          {tagline ? (
            <span className="mt-0.5 line-clamp-2 block text-xs text-text-secondary">
              {tagline}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-text-muted">
              ยังไม่มีคำโปรย - การ์ดจะดึงดูดกว่านี้ถ้ามี
            </span>
          )}
          <span className="mt-1 block text-[11px] text-text-muted">
            โดย {authorName} · FictionThai
          </span>
        </span>
      </div>
    </section>
  );
}
