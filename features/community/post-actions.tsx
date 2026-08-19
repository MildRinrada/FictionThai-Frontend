"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { readCSRFToken } from "@/lib/auth-client";
import { deleteCommunityPost, getCommunityPost } from "@/lib/community-client";
import type { CommunityPost } from "@/types/community";

import { PostForm } from "./post-form";

/**
 * Owner controls on a post detail page: edit in place, or delete and return
 * to the feed.
 *
 * The page's server render is the PUBLIC-FIRST cached response, whose
 * is_owner is the guest view - so ownership is re-checked after mount with
 * the caller's credentials when a session appears to exist (the CSRF cookie
 * is the cheap tell), the same pattern as the reaction and bookmark buttons.
 * The controls are a UI affordance either way: the API re-checks ownership on
 * every mutation (docs/10 §27).
 */

export interface PostActionsProps {
  post: CommunityPost;
}

export function PostActions({ post }: PostActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(post);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (post.is_owner || !readCSRFToken()) return;
    let cancelled = false;
    getCommunityPost(post.id)
      .then((mine) => {
        if (!cancelled && mine.is_owner) setCurrent(mine);
      })
      .catch(() => {
        // Not signed in, or the API is briefly unreachable: no controls.
      });
    return () => {
      cancelled = true;
    };
  }, [post.id, post.is_owner]);

  const remove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCommunityPost(current.id);
      router.push("/community");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, current.id, router]);

  if (!current.is_owner) return null;

  if (editing) {
    return (
      <div className="mt-4 rounded-md border border-border bg-surface p-4">
        <PostForm
          post={current}
          onSaved={(updated) => {
            setCurrent(updated);
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-4 text-sm">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-text-secondary hover:text-primary"
      >
        แก้ไขโพสต์
      </button>
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="text-text-secondary hover:text-error"
      >
        ลบโพสต์
      </button>
    </div>
  );
}
