"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { CommunityComments } from "@/features/community/community-comments";
import { ReactionButton } from "@/features/community/reaction-button";
import { count, relativeTime } from "@/lib/format";
import type { CommunityPost } from "@/types/community";

/**
 * โพสต์ชุมชนที่พูดถึงเรื่องนี้ (§13R).
 *
 * The community already lets a post attach a fiction, and the fiction's own
 * author was the one person with no way to find those posts: they had to
 * scroll the feed looking for their own title. This is that list, and it is
 * INTERACTIVE on purpose - a writer who has to open a new tab to say thank you
 * usually does not.
 *
 * The like button and the thread are the community's own islands, unchanged.
 * Reusing them rather than building studio copies is what keeps a reply sent
 * from here identical to one sent from the post page - same endpoint, same
 * rules, same moderation.
 *
 * The thread is collapsed until asked for: each one is a request, and a page
 * of ten posts must not open ten of them to show a writer nobody has replied.
 */
export function NovelPosts({ posts }: { posts: CommunityPost[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {posts.map((post) => (
        <li key={post.id}>
          <PostRow post={post} />
        </li>
      ))}
    </ol>
  );
}

function PostRow({ post }: { post: CommunityPost }) {
  const [open, setOpen] = useState(false);
  const authorName = post.author.display_name ?? post.author.username;

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <header className="flex items-start gap-3">
        <span className="art-placeholder flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
          {post.author.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element -- avatars are
               served from object storage, an origin the image optimizer has no
               configured loader for. */
            <img src={post.author.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="user" size={15} className="text-text-muted" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Link
              href={`/users/${encodeURIComponent(post.author.username)}`}
              className="font-medium hover:text-primary"
            >
              {authorName}
            </Link>
            <span className="font-mono text-xs text-text-muted">
              @{post.author.username}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            <time dateTime={post.created_at}>{relativeTime(post.created_at)}</time>
            {post.reference?.chapter_title ? ` · แนบ ${post.reference.chapter_title}` : ""}
          </span>
        </span>

        <Link
          href={`/community/post/${encodeURIComponent(post.id)}`}
          aria-label="เปิดโพสต์ในหน้าชุมชน"
          title="เปิดโพสต์ในหน้าชุมชน"
          className="shrink-0 text-text-muted hover:text-primary"
        >
          <Icon name="external" size={15} />
        </Link>
      </header>

      {/* Text as text, never markup - the same rule the community feed follows. */}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>

      <footer className="mt-3 flex flex-wrap items-center gap-2.5">
        <ReactionButton
          postId={post.id}
          initialCount={post.reaction_count}
          initialMyReaction={post.my_reaction}
        />
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-text-secondary hover:border-primary hover:text-primary"
        >
          <Icon name="message" size={15} />
          ความคิดเห็น
          {post.comment_count > 0 ? ` ${count(post.comment_count)}` : ""}
        </button>
      </footer>

      {open ? (
        <div className="mt-4 border-t border-hairline pt-4">
          <CommunityComments postId={post.id} />
        </div>
      ) : null}
    </article>
  );
}
