import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/ui/section-header";
import { NovelPosts } from "@/features/studio/novel-posts";
import { fetchPostsAboutNovel } from "@/lib/community-server";
import { decodeParam, fetchOwnerNovel } from "@/lib/fiction-server";
import { count } from "@/lib/format";

/**
 * โพสต์ชุมชนที่พูดถึงเรื่องนี้ (§13R).
 *
 * A post can attach a fiction, and until now the fiction's own author was the
 * one person who could not find those posts without scrolling the community
 * looking for their own title. This is that list - and the writer can like and
 * reply from here, using the community's own controls, so answering a reader
 * does not start with a search.
 *
 * It shows what the CALLER may see, not what the fiction's author "should" get.
 * A followers-only post from someone they do not follow is not theirs to read,
 * and widening the rule because the post happens to be about their work would
 * make this page a way around the audience its author chose.
 */

export const metadata: Metadata = {
  title: "โพสต์ชุมชนที่พูดถึงเรื่องนี้",
  robots: { index: false, follow: false },
};

export default async function StudioNovelCommunityPage({
  params,
  searchParams,
}: PageProps<"/studio/novels/[ref]/community">) {
  const { ref: rawRef } = await params;
  const { page: rawPage } = await searchParams;
  const ref = decodeParam(rawRef);
  const page = Math.max(1, Number.parseInt(String(rawPage ?? "1"), 10) || 1);

  const novel = await fetchOwnerNovel(ref);
  if (!novel) notFound();

  const result = await fetchPostsAboutNovel(novel.slug, page);
  /*
   * The filter is the API's, and this is the belt to its braces.
   *
   * The page's whole claim is "posts that mention THIS fiction". An API build
   * that does not know the `novel` parameter answers with the ordinary feed
   * instead of an error, and a panel full of unrelated posts under that
   * heading is worse than an empty one - it reads as the platform inventing
   * discussion of somebody's work. So the reference is checked here too: a
   * post that does not point at this fiction is not shown, whatever came back.
   */
  const posts = (result?.items ?? []).filter(
    (post) =>
      post.reference?.novel_id === novel.id || post.reference?.novel_slug === novel.slug,
  );
  // The count reported is the count SHOWN. The envelope's total describes what
  // the API matched, and after the guard above those can differ.
  const total = posts.length;
  // The envelope carries page, per_page, and total (docs/09 §7); the page count
  // is derived rather than sent, so it is derived once here.
  const totalPages = result
    ? Math.max(1, Math.ceil(result.meta.total / result.meta.per_page))
    : 1;

  return (
    <div>
      <SectionHeader
        title={
          total > 0
            ? `โพสต์ชุมชนที่พูดถึงเรื่องนี้ · ${count(total)}`
            : "โพสต์ชุมชนที่พูดถึงเรื่องนี้"
        }
      />

      {result === null ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">
          ตอนนี้ยังโหลดโพสต์ไม่ได้ ลองรีเฟรชอีกครั้ง
        </p>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-serif text-base font-semibold">ยังไม่มีใครโพสต์ถึงเรื่องนี้</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            เมื่อมีคนแนบเรื่องหรือตอนของคุณไว้ในโพสต์ชุมชน โพสต์นั้นจะมาอยู่ตรงนี้
            กดถูกใจและตอบกลับได้จากหน้านี้เลย ไม่ต้องไปหาในหน้าชุมชน
          </p>
          <Link
            href="/community"
            className="mt-5 inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-primary"
          >
            ไปที่หน้าชุมชน
          </Link>
        </div>
      ) : (
        <>
          <NovelPosts posts={posts} />

          {/* Plain links, so paging works before hydration and for a reader
              with JavaScript off - the same rule the community feed follows. */}
          {totalPages > 1 ? (
            <nav
              aria-label="หน้าของโพสต์"
              className="mt-6 flex items-center justify-between text-sm"
            >
              {page > 1 ? (
                <Link
                  href={`?page=${page - 1}`}
                  className="text-text-secondary hover:text-primary"
                >
                  ← ก่อนหน้า
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-text-muted">
                หน้า {page} จาก {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={`?page=${page + 1}`}
                  className="text-text-secondary hover:text-primary"
                >
                  ถัดไป →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
