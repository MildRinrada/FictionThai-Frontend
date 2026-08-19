import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/ui/section-header";
import { ChapterManager } from "@/features/studio/chapter-manager";
import { decodeParam, fetchOwnerNovel, fetchOwnerChapters } from "@/lib/fiction-server";
import { count } from "@/lib/format";
import type { ChapterSummary } from "@/types/novel";

/**
 * All chapters of one fiction, with their publication state.
 *
 * The list is server-rendered; the actions on it are a client island. Chapter
 * numbering and status come from the API on every render, so what a writer sees
 * here is what their readers can actually reach.
 */

export const metadata: Metadata = {
  title: "ตอนทั้งหมด",
  robots: { index: false, follow: false },
};

/**
 * The mode the add form preselects (13X): the mode of the LAST-CREATED chapter
 * - one predictable rule - falling back to the fiction's own format for a
 * fiction with no chapters yet. Never "most used", never "last edited".
 */
function lastCreatedFormat(chapters: ChapterSummary[], fallback: string): string {
  let latest: ChapterSummary | null = null;
  for (const chapter of chapters) {
    if (!latest || chapter.created_at > latest.created_at) latest = chapter;
  }
  return latest?.active_format ?? fallback;
}

export default async function StudioChaptersPage({
  params,
}: PageProps<"/studio/novels/[ref]/chapters">) {
  const { ref: rawRef } = await params;
  const ref = decodeParam(rawRef);

  // The OWNER's list (§13T): fetchChapters asks the public path first, which
  // for a public fiction would hand the studio a list with no drafts in it.
  const [novel, chapters] = await Promise.all([
    fetchOwnerNovel(ref),
    fetchOwnerChapters(ref),
  ]);
  if (!novel) notFound();

  // The running total a writer actually tracks (13X). Drafts count - it is
  // their manuscript - with the published share stated beside it.
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.word_count, 0);
  const publishedWords = chapters.reduce(
    (sum, chapter) =>
      chapter.status === "published" ? sum + chapter.word_count : sum,
    0,
  );

  return (
    <div>
      <SectionHeader
        title={`ตอนทั้งหมด · ${count(chapters.length)}`}
        subLabel={
          totalWords > 0
            ? `${count(totalWords)} คำ (เผยแพร่แล้ว ${count(publishedWords)})`
            : undefined
        }
      />

      <ChapterManager
        novelRef={novel.slug}
        chapters={chapters}
        usesChapterNavigation={novel.uses_chapter_navigation}
        defaultFormat={lastCreatedFormat(chapters, novel.presentation_format)}
        chapterUnit={novel.chapter_unit}
        novelVisibility={novel.visibility ?? "private"}
        nextNumber={
          chapters.reduce((highest, chapter) =>
            Math.max(highest, chapter.chapter_number), 0) + 1
        }
      />
    </div>
  );
}
