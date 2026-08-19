"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/icon";
import { ReportButton } from "@/features/moderation/report-button";
import { readCSRFToken } from "@/lib/auth-client";
import { unfollowUser } from "@/lib/library-client";
import type { CommunityPost } from "@/types/community";

/**
 * The ⋯ menu on a feed card (docs/COMMUNITY-FEED.md): copy link, report,
 * hide, unfollow - the actions that used to be nowhere. Follows the
 * account-menu dismissal contract: outside click and Escape both close.
 *
 * "ซ่อนโพสต์นี้" is a device preference, not a request to the author - the
 * card collapses locally and the post is untouched (writer content is never
 * modified by a reader's view settings).
 */
// Cookies emit no change events; the value is re-read per render instead.
const noopSubscribe = () => () => {};

export function PostMenu({
  post,
  onHide,
}: {
  post: CommunityPost;
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unfollowed, setUnfollowed] = useState(false);
  // The CSRF cookie is the "probably signed in" tell (see reaction-button);
  // a cookie is an external store, read false during server render.
  const signedIn = useSyncExternalStore(
    noopSubscribe,
    () => readCSRFToken() !== null,
    () => false,
  );
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/community/post/${post.id}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied: the item simply does not confirm.
    }
  };

  const unfollow = async () => {
    try {
      await unfollowUser(post.author.id);
      setUnfollowed(true);
    } catch {
      // A failed unfollow leaves the item as it was; the profile page has
      // the full-fidelity control.
    }
  };

  const itemClass =
    "flex min-h-9 w-full items-center gap-2 rounded px-2.5 text-start text-[13px] hover:bg-surface-secondary";

  return (
    <span ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="เมนูโพสต์"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
      >
        <Icon name="more-horizontal" size={16} />
      </button>

      {open ? (
        <span
          role="menu"
          className="absolute top-full z-30 mt-1 flex w-52 flex-col rounded-md border border-border bg-surface p-1 shadow-popover inset-e-0"
        >
          <button type="button" role="menuitem" onClick={copyLink} className={itemClass}>
            <Icon name="link" size={13} />
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </button>

          {post.is_owner ? (
            <Link
              role="menuitem"
              href={`/community/post/${post.id}`}
              className={itemClass}
            >
              <Icon name="edit" size={13} />
              แก้ไขโพสต์
            </Link>
          ) : (
            <>
              <span className="rounded hover:bg-surface-secondary">
                <ReportButton
                  targetType="community_post"
                  targetId={post.id}
                  compact
                />
              </span>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onHide();
                }}
                className={itemClass}
              >
                <Icon name="eye" size={13} />
                ซ่อนโพสต์นี้
              </button>
              {signedIn ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void unfollow()}
                  disabled={unfollowed}
                  className={`${itemClass} disabled:text-text-muted`}
                >
                  <Icon name="users" size={13} />
                  {unfollowed
                    ? "เลิกติดตามแล้ว"
                    : `เลิกติดตาม @${post.author.username}`}
                </button>
              ) : null}
            </>
          )}
        </span>
      ) : null}
    </span>
  );
}
