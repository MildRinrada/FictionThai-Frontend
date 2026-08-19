"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getNovelProgress } from "@/lib/library-client";
import { readLocalProgress } from "@/lib/local-progress";
import { readCSRFToken } from "@/lib/auth-client";

/**
 * "Start Reading" that quietly becomes "Continue Reading" (docs/02 - the novel
 * page offers Continue Reading; docs/01 §10).
 *
 * The fiction page is a shared, cacheable Server Component; the reader's own
 * position is personal, so it is looked up here after mount - server progress
 * for a signed-in reader, localStorage for a guest (docs/03 §11). Until (or
 * unless) a position is found, the button is a plain link to the first chapter,
 * so a guest with no history costs zero extra requests.
 */

export interface StartReadingProps {
  novelId: string;
  novelSlug: string;
  /** The first readable chapter's slug; absent when nothing is published. */
  firstChapterSlug?: string;
}

export function StartReading({ novelId, novelSlug, firstChapterSlug }: StartReadingProps) {
  const [resumeChapter, setResumeChapter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (readCSRFToken() !== null) {
      // Likely signed in: the server holds the cross-device position.
      getNovelProgress(novelId)
        .then((progress) => {
          if (!cancelled) setResumeChapter(progress.chapter_id);
        })
        .catch(() => {
          // 404 (never started), 401 (guest after all), or a blip - the plain
          // start link is always correct.
        });
      return () => {
        cancelled = true;
      };
    }

    // Guest: the device remembers. Deferred a tick so hydration completes with
    // the same markup the server produced before the label can change.
    const local = readLocalProgress(novelId);
    if (local) {
      const chapterId = local.chapter_id;
      queueMicrotask(() => {
        if (!cancelled) setResumeChapter(chapterId);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [novelId]);

  if (!firstChapterSlug) {
    return <p className="text-sm text-text-secondary">ยังไม่มีตอนที่เผยแพร่</p>;
  }

  const target = resumeChapter ?? firstChapterSlug;
  return (
    <Link
      href={`/read/${encodeURIComponent(novelSlug)}/${encodeURIComponent(target)}`}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      {resumeChapter ? "อ่านต่อ" : "เริ่มอ่าน"}
    </Link>
  );
}
