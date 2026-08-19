"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PostForm } from "@/features/community/post-form";
import { Icon } from "@/components/ui/icon";
import { fetchCurrentUser } from "@/lib/auth-client";
import type { CurrentUser } from "@/types/auth";

/**
 * The composer at the top of the community feed.
 *
 * It is a client island for one reason: the feed page must stay a public,
 * credential-free Server Component so a single cached response serves every
 * visitor (docs/14 §7). Identity is therefore asked for AFTER mount, here,
 * instead of turning the whole page personal.
 *
 * The box keeps a fixed minimum height across all three states - unknown,
 * guest, signed in - so the feed below it does not jump once identity arrives.
 */

export function InlineComposer() {
  const router = useRouter();
  // undefined = not asked yet, null = guest.
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        // A failed identity check is treated as "not signed in": the API is
        // still the authority, and posting will simply answer 401.
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === undefined) {
    return <div className="min-h-30 rounded-lg border border-border bg-surface" />;
  }

  if (user === null) {
    return (
      <div className="flex min-h-30 flex-col justify-center rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-text-secondary">
          เข้าสู่ระบบเพื่อเล่าถึงตอนที่เพิ่งอ่าน หรือแนบตอนที่อยากชวนคุย
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/login?next=%2Fcommunity"
            className="inline-flex min-h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-9 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-primary"
          >
            สมัครสมาชิก
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-30 rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="art-placeholder flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
          {user.avatar_url ? (
            // Avatars are served from object storage, an origin the image
            // optimizer has no configured loader for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="user" size={14} className="text-text-muted" />
          )}
        </span>
        <span className="text-sm">
          <span className="font-medium">{user.display_name ?? user.username}</span>{" "}
          <span className="font-mono text-xs text-text-muted">@{user.username}</span>
        </span>
      </div>

      <PostForm
        compact
        onSaved={() => {
          // The feed is a Server Component, so a refresh is what actually
          // shows the new post - router.push alone would keep the cached list.
          router.refresh();
        }}
      />
    </div>
  );
}
