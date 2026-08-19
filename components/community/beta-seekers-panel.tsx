import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { relativeTime } from "@/lib/format";
import type { CommunityPost } from "@/types/community";

/**
 * "นักเขียนที่กำลังหาเบต้า/คู่เขียน" (docs/COMMUNITY-FEED.md): the newest
 * public beta_request posts, reduced to who is asking. This is the sidebar
 * meeting the community's actual habit - these requests happen off-platform
 * today; a standing surface gives them somewhere to land.
 *
 * Renders nothing when nobody is looking.
 */
export function BetaSeekersPanel({ items }: { items: CommunityPost[] }) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="beta-seekers-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="beta-seekers-heading" className="mono-label">
        กำลังหาเบต้า/คู่เขียน
      </h2>

      <ol className="mt-3 space-y-3">
        {items.map((post) => (
          <li key={post.id}>
            <Link href={`/community/post/${post.id}`} className="group flex items-start gap-2.5">
              <span className="art-placeholder flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
                {post.author.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.author.avatar_url} alt="" className="size-full object-cover" />
                ) : (
                  <Icon name="user" size={12} className="text-text-muted" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium group-hover:text-primary">
                  {post.author.display_name?.trim() || `@${post.author.username}`}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-text-secondary">
                  {post.content}
                </span>
                <span className="mt-0.5 block text-[11px] text-text-muted">
                  {relativeTime(post.created_at)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <Link
        href="/community?type=beta_request"
        className="mt-3 block text-xs text-primary hover:underline"
      >
        ดูทั้งหมด →
      </Link>
    </section>
  );
}
