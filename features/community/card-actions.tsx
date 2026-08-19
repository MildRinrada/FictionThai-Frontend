"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import {
  bookmarkPost,
  reactToPost,
  removeReaction,
  unbookmarkPost,
} from "@/lib/community-client";

/**
 * The action row on a feed card (docs/COMMUNITY-FEED.md): real buttons with a
 * real hit area (size-8 ≈ 32px), hover states, and no "0" noise - a count
 * only appears once it exists.
 *
 * State arrives from the SERVER: signed-in visitors get the feed fetched with
 * their credentials, so my_reaction/bookmarked are already correct and no
 * card ever re-fetches itself after mount (the N+1 the old detail-page button
 * would have caused here). Guests get pristine buttons; pressing one routes
 * to sign-in with the way back preserved.
 */

function loginNext(router: ReturnType<typeof useRouter>) {
  const next = encodeURIComponent(
    window.location.pathname + window.location.search,
  );
  router.push(`/login?next=${next}`);
}

export function LikeButton({
  postId,
  initialCount,
  initialMyReaction,
}: {
  postId: string;
  initialCount: number;
  initialMyReaction?: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [reacted, setReacted] = useState(Boolean(initialMyReaction));
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const wasReacted = reacted;
    const wasCount = count;
    setReacted(!wasReacted);
    setCount(wasCount + (wasReacted ? -1 : 1));
    try {
      if (wasReacted) {
        await removeReaction(postId);
      } else {
        await reactToPost(postId);
      }
    } catch (error) {
      setReacted(wasReacted);
      setCount(wasCount);
      if (error instanceof ApiError && error.isUnauthorized) {
        loginNext(router);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={reacted}
      aria-label="ถูกใจ"
      className={`inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-[13px] transition-colors ${
        reacted
          ? "text-primary"
          : "text-text-muted hover:bg-surface-secondary hover:text-primary"
      }`}
    >
      <span aria-hidden className="text-[15px] leading-none">
        {reacted ? "♥" : "♡"}
      </span>
      {count > 0 ? <span className="font-mono tabular-nums">{count}</span> : null}
    </button>
  );
}

export function CommentLink({
  postId,
  count,
}: {
  postId: string;
  count: number;
}) {
  return (
    <Link
      href={`/community/post/${postId}`}
      aria-label="ความคิดเห็น"
      className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-[13px] text-text-muted transition-colors hover:bg-surface-secondary hover:text-primary"
    >
      <Icon name="message" size={15} />
      {count > 0 ? <span className="font-mono tabular-nums">{count}</span> : null}
    </Link>
  );
}

export function BookmarkButton({
  postId,
  initialBookmarked,
}: {
  postId: string;
  initialBookmarked: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialBookmarked);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const was = saved;
    setSaved(!was);
    try {
      if (was) {
        await unbookmarkPost(postId);
      } else {
        await bookmarkPost(postId);
      }
    } catch (error) {
      setSaved(was);
      if (error instanceof ApiError && error.isUnauthorized) {
        loginNext(router);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={saved}
      aria-label={saved ? "เลิกบันทึกโพสต์" : "บันทึกโพสต์ไว้อ่านทีหลัง"}
      title={saved ? "บันทึกแล้ว" : "บันทึกไว้อ่านทีหลัง"}
      className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md transition-colors ${
        saved
          ? "text-primary"
          : "text-text-muted hover:bg-surface-secondary hover:text-primary"
      }`}
    >
      <Icon name="bookmark" size={15} />
    </button>
  );
}
