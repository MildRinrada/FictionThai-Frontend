"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { bookmarkNovel, getBookmarkStatus, removeBookmark } from "@/lib/library-client";

/**
 * The bookmark toggle on a fiction page.
 *
 * The page itself is a cacheable, identical-for-everyone Server Component;
 * everything personal lives in this island, which asks the API for the
 * caller's own state after mount (docs/14 §7 - personalised responses never
 * share a cache).
 *
 * A guest who clicks is sent to sign in with a return path, preserving the
 * original intent (docs/02 §5.2). The UI is optimistic because the API is
 * idempotent (docs/09 §33) - a repeat or a race resolves to the same state.
 */

export interface BookmarkButtonProps {
  novelRef: string;
}

export function BookmarkButton({ novelRef }: BookmarkButtonProps) {
  const router = useRouter();
  // null = unknown: still loading, or the visitor is a guest.
  const [saved, setSaved] = useState<boolean | null>(null);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBookmarkStatus(novelRef)
      .then((status) => {
        if (!cancelled) setSaved(status.is_bookmarked);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.isUnauthorized) {
          setGuest(true);
        }
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

    const next = !(saved ?? false);
    setSaved(next); // optimistic; both mutations are idempotent
    setBusy(true);
    try {
      if (next) {
        await bookmarkNovel(novelRef);
      } else {
        await removeBookmark(novelRef);
      }
    } catch (error) {
      setSaved(!next); // roll back what we claimed
      if (error instanceof ApiError && error.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    } finally {
      setBusy(false);
    }
  }, [guest, novelRef, router, saved]);

  return (
    <Button
      variant={saved ? "secondary" : "primary"}
      onClick={toggle}
      loading={busy}
      aria-pressed={saved ?? false}
    >
      {saved ? "บันทึกแล้ว" : "บันทึกเข้าคลัง"}
    </Button>
  );
}
