"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { count } from "@/lib/format";
import { getLikeStatus, likeNovel, unlikeNovel } from "@/lib/library-client";

/**
 * The like toggle on a fiction page (docs/01 §20.2).
 *
 * The same shape as the bookmark island beside it: the page stays a cacheable
 * Server Component, and the caller's own state is asked for after mount so a
 * personalised response never shares a cache (docs/14 §7).
 *
 * The count is seeded from the server render and moved optimistically, because
 * a reader who taps a heart should see it fill immediately. Both mutations are
 * idempotent, so a repeat or a race resolves to the same state (docs/09 §33).
 *
 * This is the one control on the fiction page allowed to use coral: liking is an
 * emotional interaction, which is exactly what docs/05 §4 reserves it for.
 */

export interface LikeButtonProps {
  novelRef: string;
  /** The count as of the server render. */
  initialCount: number;
  /**
   * ซ่อนตัวเลข (13U): the author keeps the scoreboard off this fiction. The
   * button still works - what disappears is the number beside it, because a
   * server-zeroed count rendered as "0" would misreport a choice as failure.
   */
  hideCount?: boolean;
  /**
   * The heart alone, sized for the reader's floating toolbar (reader toolbar
   * review 2026-08). Same behaviour, no words, no count.
   */
  compact?: boolean;
}

export function LikeButton({
  novelRef,
  initialCount,
  hideCount = false,
  compact = false,
}: LikeButtonProps) {
  const router = useRouter();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [total, setTotal] = useState(initialCount);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLikeStatus(novelRef)
      .then((status) => {
        if (!cancelled) setLiked(status.is_liked);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.isUnauthorized) setGuest(true);
        // Any other failure leaves the state unknown; the button still works -
        // the API remains the authority on what the click does.
      });
    return () => {
      cancelled = true;
    };
  }, [novelRef]);

  const toggle = useCallback(async () => {
    if (guest) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !(liked ?? false);
    setLiked(next);
    setTotal((current) => Math.max(0, current + (next ? 1 : -1)));
    setBusy(true);
    try {
      if (next) await likeNovel(novelRef);
      else await unlikeNovel(novelRef);
    } catch (error) {
      setLiked(!next);
      setTotal((current) => Math.max(0, current + (next ? -1 : 1)));
      if (error instanceof ApiError && error.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    } finally {
      setBusy(false);
    }
  }, [guest, liked, novelRef, router]);

  const active = liked ?? false;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={active}
        aria-label={active ? "เลิกถูกใจเรื่องนี้" : "ถูกใจเรื่องนี้"}
        title={active ? "ถูกใจแล้ว" : "ถูกใจเรื่องนี้"}
        className={`flex size-8 items-center justify-center rounded-full disabled:opacity-60 ${
          active
            ? "bg-secondary-50 text-secondary-600"
            : "text-text-secondary hover:bg-surface-secondary hover:text-secondary-600"
        }`}
      >
        <Icon name="heart" size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-60 ${
        active
          ? "border-secondary bg-secondary-50 text-secondary-600"
          : "border-border text-text-secondary hover:border-secondary-300 hover:text-secondary-600"
      }`}
    >
      <Icon name="heart" size={17} />
      {active ? "ถูกใจแล้ว" : "ถูกใจ"}
      {!hideCount ? (
        <span className="font-mono text-xs tabular-nums">{count(total)}</span>
      ) : null}
    </button>
  );
}
