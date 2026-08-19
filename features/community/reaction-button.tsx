"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import { getCommunityPost, reactToPost, removeReaction } from "@/lib/community-client";

/**
 * The like toggle on a community post (docs/09 §21, docs/01 §20.2).
 *
 * Optimistic because both mutations are idempotent (docs/09 §33): a repeat or
 * a race resolves to the same state. A guest's click routes to sign-in with a
 * return path, preserving intent (docs/02 §5.2).
 *
 * Initial state comes from the server payload - which, on the public-first
 * cached pages, is the GUEST view and cannot know the caller's own reaction
 * (docs/14 §7). So when a session appears to exist (the CSRF cookie is the
 * cheap tell), the button re-syncs once after mount, exactly like the
 * bookmark button asks for the caller's own state.
 */

export interface ReactionButtonProps {
  postId: string;
  initialCount: number;
  initialMyReaction?: string;
}

export function ReactionButton({
  postId,
  initialCount,
  initialMyReaction,
}: ReactionButtonProps) {
  const router = useRouter();
  const [reacted, setReacted] = useState(Boolean(initialMyReaction));
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!readCSRFToken()) return; // no session hint: the guest view is right
    let cancelled = false;
    getCommunityPost(postId)
      .then((post) => {
        if (cancelled) return;
        setReacted(Boolean(post.my_reaction));
        setCount(post.reaction_count);
      })
      .catch(() => {
        // Leave the server-rendered state; the API stays the authority on
        // what a click actually does.
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const toggle = useCallback(async () => {
    if (busy) return;

    const next = !reacted;
    setReacted(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));
    setBusy(true);
    try {
      if (next) {
        const state = await reactToPost(postId);
        setCount(state.reaction_count);
      } else {
        await removeReaction(postId);
      }
    } catch (error) {
      // Roll back what we claimed.
      setReacted(!next);
      setCount((current) => Math.max(0, current + (next ? -1 : 1)));
      if (error instanceof ApiError && error.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, postId, reacted, router]);

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={reacted}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
        reacted
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-text-secondary hover:border-primary hover:text-primary"
      }`}
    >
      <span aria-hidden>{reacted ? "♥" : "♡"}</span>
      <span>ถูกใจ{count > 0 ? ` ${count}` : ""}</span>
    </button>
  );
}
