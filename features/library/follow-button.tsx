"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { fetchCurrentUser } from "@/lib/auth-client";
import { followUser, getFollowStatus, unfollowUser } from "@/lib/library-client";

/**
 * The follow toggle next to an author's name (docs/09 §19, docs/01 §12).
 *
 * Same island pattern as BookmarkButton: the page stays cacheable, the
 * personal state loads after mount, a guest is sent to sign in with their
 * intent preserved (docs/02 §5.2), and optimistic updates are safe because
 * the API is idempotent (docs/09 §33).
 *
 * `hidden` when the viewer IS the author - the API rejects self-follows, so
 * offering the button would offer an error.
 *
 * `selfLinksToProfile` is for a page that cannot know in advance whose profile
 * it is showing, because it was rendered without credentials so it could be
 * cached (Phase 12E). The island resolves that itself and, when the visitor
 * turns out to be this person, offers the way to their own page instead of a
 * button that would only fail.
 */

export interface FollowButtonProps {
  authorId: string;
  /** Hide entirely (e.g. the viewer is this author). */
  hidden?: boolean;
  /** Ask who the caller is; render a link to `/profile` when it is them. */
  selfLinksToProfile?: boolean;
  /**
   * "secondary" gives the un-followed state a visible outline (writer
   * spotlight: on a card whose whole point is the follow, a ghost button
   * read as pale floating text). Ghost stays the default for pages that
   * have their own primary action. Once following, the button always goes
   * quiet - a state is not an invitation.
   */
  variant?: "ghost" | "secondary" | "primary";
  /** ติดตาม instead of ติดตามนักเขียน - for a card that IS the writer. */
  compact?: boolean;
}

export function FollowButton({
  authorId,
  hidden = false,
  selfLinksToProfile = false,
  variant = "ghost",
  compact = false,
}: FollowButtonProps) {
  const router = useRouter();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isSelf, setIsSelf] = useState(false);

  useEffect(() => {
    if (!selfLinksToProfile) return;
    let cancelled = false;
    fetchCurrentUser()
      .then((current) => {
        if (!cancelled && current?.id === authorId) setIsSelf(true);
      })
      .catch(() => {
        // Unknown identity is treated as "not this person": the worst case is
        // a follow button that answers 422, which is what the API is for.
      });
    return () => {
      cancelled = true;
    };
  }, [authorId, selfLinksToProfile]);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    getFollowStatus(authorId)
      .then((status) => {
        if (!cancelled) setFollowing(status.is_following);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.isUnauthorized) {
          setGuest(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authorId, hidden]);

  const toggle = useCallback(async () => {
    if (guest) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !(following ?? false);
    setFollowing(next);
    setBusy(true);
    try {
      if (next) {
        await followUser(authorId);
      } else {
        await unfollowUser(authorId);
      }
    } catch (error) {
      setFollowing(!next);
      if (error instanceof ApiError && error.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    } finally {
      setBusy(false);
    }
  }, [authorId, following, guest, router]);

  if (hidden) return null;

  if (isSelf) {
    return (
      <Link
        href="/profile"
        className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
      >
        นี่คือโปรไฟล์ของคุณ
      </Link>
    );
  }

  return (
    <Button
      variant={following ? "ghost" : variant}
      onClick={toggle}
      loading={busy}
      aria-pressed={following ?? false}
    >
      {following ? "กำลังติดตาม" : compact ? "ติดตาม" : "ติดตามนักเขียน"}
    </Button>
  );
}
