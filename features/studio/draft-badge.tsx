"use client";

import { useSyncExternalStore } from "react";

import { readLocalDraft } from "@/lib/local-draft";

/**
 * "บันทึกอัตโนมัติ" - this device has work the server has not been told about
 * (§13R).
 *
 * A client island because localStorage exists only in the browser, and a small
 * one on purpose: it renders nothing at all unless there IS a local copy, so
 * the common case costs a reader of this page one effect and no markup.
 *
 * It is a NOTICE, never a restore. The chapter still opens from the server's
 * copy; this says a newer local one exists, and opening the chapter is what
 * puts the writer in front of it.
 *
 * `useSyncExternalStore` rather than an effect that sets state: localStorage IS
 * an external store, and the server snapshot is null, so the badge is simply
 * absent from the HTML and appears on hydration where there is one - no
 * mismatch, and no render that shows the wrong answer first.
 */

/** localStorage does not notify this tab about its own writes, and does not
    need to: the badge is read once per page, not watched. */
function subscribe(): () => void {
  return () => {};
}

export function LocalDraftBadge({
  novelRef,
  chapterSlug,
}: {
  novelRef: string;
  chapterSlug: string;
}) {
  const savedAt = useSyncExternalStore(
    subscribe,
    // A primitive, so the snapshot is stable across renders even though the
    // read allocates.
    () => readLocalDraft(novelRef, chapterSlug)?.savedAt ?? null,
    () => null,
  );

  if (savedAt === null) return null;

  return (
    <span
      title={`บันทึกไว้ในเครื่องนี้เมื่อ ${new Date(savedAt).toLocaleString("th-TH")}`}
      className="shrink-0 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] text-warning"
    >
      บันทึกอัตโนมัติ
    </span>
  );
}
