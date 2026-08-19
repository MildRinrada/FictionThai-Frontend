import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReferenceCard } from "@/components/community/reference-card";
import { CommunityComments } from "@/features/community/community-comments";
import { PostActions } from "@/features/community/post-actions";
import { ReactionButton } from "@/features/community/reaction-button";
import { ReportButton } from "@/features/moderation/report-button";
import { fetchCommunityPost } from "@/lib/community-server";
import { decodeParam } from "@/lib/fiction-server";

/**
 * One community post - docs/03 §14 `/community/post/[id]`.
 *
 * A Server Component on the public-first fetch path; a followers-only or
 * private post falls back to an authenticated fetch, so the audience decision
 * stays entirely with the API (docs/11 §37). Interaction - reacting,
 * discussing, the owner's edit/delete - lives in client islands.
 */

const VISIBILITY_BADGES: Record<string, string> = {
  followers: "เฉพาะผู้ติดตาม",
  private: "ส่วนตัว",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchCommunityPost(decodeParam(id));
  // Thrown HERE so the 404 STATUS is committed before streaming begins.
  if (!post) notFound();

  const authorName = post.author.display_name ?? post.author.username;
  return {
    title: `โพสต์ของ ${authorName}`,
    // Only public posts may be indexed; a narrower audience means the page
    // was served with the viewer's credentials.
    robots: post.visibility !== "public" ? { index: false, follow: false } : undefined,
  };
}

export default async function CommunityPostPage({ params }: PageProps) {
  const { id: rawID } = await params;
  const post = await fetchCommunityPost(decodeParam(rawID));
  if (!post) notFound();

  const authorName = post.author.display_name ?? post.author.username;
  const badge = VISIBILITY_BADGES[post.visibility];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/community" className="text-text-secondary hover:text-primary">
          ← กลับสู่ชุมชน
        </Link>
      </nav>

      <article>
        <header className="mb-4 flex flex-wrap items-baseline gap-2">
          <h1 className="text-lg font-semibold">{authorName}</h1>
          <time dateTime={post.created_at} className="text-sm text-text-secondary">
            {formatDate(post.created_at)}
          </time>
          {post.edited ? (
            <span className="text-sm text-text-muted">(แก้ไขแล้ว)</span>
          ) : null}
          {badge ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
              {badge}
            </span>
          ) : null}
        </header>

        <p className="whitespace-pre-wrap">{post.content}</p>

        {/* Resolved against THIS reader by the API; absent means no card, not
            a broken one (docs/PHASE-12-STORY-DEPTH.md §12D). */}
        {post.reference ? <ReferenceCard reference={post.reference} /> : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ReactionButton
            postId={post.id}
            initialCount={post.reaction_count}
            initialMyReaction={post.my_reaction}
          />
          {/* docs/11 §38 lists community posts as reportable. */}
          <ReportButton targetType="community_post" targetId={post.id} />
        </div>

        <PostActions post={post} />
      </article>

      <CommunityComments postId={post.id} />
    </main>
  );
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeStyle: "short" })
      .format(new Date(value));
  } catch {
    return value;
  }
}
