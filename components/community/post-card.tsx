"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { ReferenceCard } from "@/components/community/reference-card";
import { Icon } from "@/components/ui/icon";
import {
  BookmarkButton,
  CommentLink,
  LikeButton,
} from "@/features/community/card-actions";
import { PostMenu } from "@/features/community/post-menu";
import {
  communityPrefsSnapshot,
  emptyCommunityPrefs,
  hidePost,
  matchesMutedWord,
  subscribeCommunityPrefs,
  unhidePost,
} from "@/lib/community-prefs";
import { collapseRepeats, splitAroundMatches } from "@/lib/community-content";
import { relativeTime } from "@/lib/format";
import {
  POST_TYPE_LABELS,
  type CommunityPost,
  type CommunityPostType,
} from "@/types/community";

/**
 * One post in the community feed (docs/COMMUNITY-FEED.md).
 *
 * A client component now, deliberately: the card carries real interaction -
 * like, save, the ⋯ menu, click-to-open - and hiding is a device preference
 * that must apply before the reader scrolls past. It still server-renders in
 * full; hydration adds behaviour, not content. Interaction STATE arrives from
 * the server (the page fetches with credentials for signed-in visitors), so
 * no card re-fetches itself after mount.
 *
 * The attached fiction card renders from `post.reference`, which the API
 * resolves against the reader. A post whose fiction this reader may not open
 * arrives with no reference and renders as an ordinary post - no gap, no
 * placeholder, nothing naming what is missing (§12D).
 */

/** Shown only when the audience is NARROWER than everyone - "สาธารณะ" on
 * every card was noise, and its absence now means exactly that. */
const NARROW_VISIBILITY_LABELS: Record<string, string> = {
  followers: "เฉพาะผู้ติดตาม",
  private: "ส่วนตัว",
};

/** Past ~5 rendered lines the clamp cuts in; the link then says so. */
function probablyClamped(content: string): boolean {
  if (content.split("\n").length > 5) return true;
  return Array.from(content).length > 320;
}

function ContentText({ text, highlight }: { text: string; highlight?: string }) {
  const shown = collapseRepeats(text);
  if (!highlight || highlight.trim() === "") {
    return <>{shown}</>;
  }
  const parts = splitAroundMatches(shown, highlight);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-sm bg-primary-100 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function PostCard({
  post,
  highlight,
}: {
  post: CommunityPost;
  /** The search needle to <mark> inside the content, when searching. */
  highlight?: string;
}) {
  const router = useRouter();
  const href = `/community/post/${post.id}`;

  // Device preferences are an external store (localStorage); the server
  // snapshot is empty, so every visitor gets the same HTML and a hidden card
  // collapses on hydration. "แสดง" reveals THIS render regardless of why the
  // card was collapsed.
  const prefs = useSyncExternalStore(
    subscribeCommunityPrefs,
    communityPrefsSnapshot,
    emptyCommunityPrefs,
  );
  const [revealed, setRevealed] = useState(false);
  const hidden = !revealed && prefs.hidden.includes(post.id);
  const mutedBy =
    revealed || hidden ? null : matchesMutedWord(post.content, prefs.muted);

  if (hidden || mutedBy !== null) {
    return (
      <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs text-text-muted">
        <span className="truncate">
          {mutedBy !== null ? (
            <>ซ่อนแล้ว - มีคำที่คุณปิดไว้ ({mutedBy})</>
          ) : (
            <>ซ่อนโพสต์นี้แล้ว</>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            unhidePost(post.id);
            setRevealed(true);
          }}
          className="shrink-0 text-primary hover:underline"
        >
          แสดง
        </button>
      </div>
    );
  }

  const displayName = post.author.display_name?.trim() || null;
  const typeLabel =
    post.post_type !== "discussion"
      ? POST_TYPE_LABELS[post.post_type as CommunityPostType]
      : undefined;
  const narrowLabel = NARROW_VISIBILITY_LABELS[post.visibility];

  // The whole card opens the post - unless the reader is selecting text or
  // pressing something interactive inside it.
  const onCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (window.getSelection()?.toString()) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, [role='menu'], mark")) return;
    router.push(href);
  };

  return (
    <article
      onClick={onCardClick}
      className="cursor-pointer rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary-200"
    >
      <header className="flex items-start gap-2.5">
        <span className="art-placeholder flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
          {post.author.avatar_url ? (
            // Avatars are served from object storage, an origin the image
            // optimizer has no configured loader for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.author.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="user" size={14} className="text-text-muted" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 text-sm leading-tight">
            {/* One identity, not two: the pen name with the @handle beneath,
                or the @handle alone when no pen name is set. */}
            <Link
              href={`/users/${encodeURIComponent(post.author.username)}`}
              className="truncate font-medium hover:text-primary"
            >
              {displayName ?? `@${post.author.username}`}
            </Link>
            {typeLabel ? (
              <span className="inline-flex items-center rounded-sm border border-primary-200 px-1.5 text-[11px] whitespace-nowrap text-primary">
                {typeLabel}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-text-muted">
            {displayName ? (
              <span className="font-mono">@{post.author.username}</span>
            ) : null}
            <Link href={href} className="hover:text-primary hover:underline">
              <time dateTime={post.created_at}>{relativeTime(post.created_at)}</time>
            </Link>
            {narrowLabel ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="lock" size={11} />
                {narrowLabel}
              </span>
            ) : null}
            {post.edited ? <span>แก้ไขแล้ว</span> : null}
          </span>
        </span>

        <PostMenu
          post={post}
          onHide={() => {
            setRevealed(false);
            hidePost(post.id);
          }}
        />
      </header>

      <p className="mt-2 line-clamp-5 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
        <ContentText text={post.content} highlight={highlight} />
      </p>
      {probablyClamped(post.content) ? (
        <Link href={href} className="mt-1 inline-block text-[13px] text-primary hover:underline">
          อ่านต่อ
        </Link>
      ) : null}

      {post.reference ? <ReferenceCard reference={post.reference} /> : null}

      <footer className="mt-2 flex items-center gap-1">
        <LikeButton
          postId={post.id}
          initialCount={post.reaction_count}
          initialMyReaction={typeof post.my_reaction === "string" ? post.my_reaction : undefined}
        />
        <CommentLink postId={post.id} count={post.comment_count} />
        <span className="ms-auto">
          <BookmarkButton postId={post.id} initialBookmarked={post.bookmarked ?? false} />
        </span>
      </footer>
    </article>
  );
}
