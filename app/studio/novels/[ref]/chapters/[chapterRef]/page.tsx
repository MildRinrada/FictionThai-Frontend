import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChapterEditor } from "@/features/studio/chapter-editor";
import { fetchCharacters } from "@/lib/characters-server";
import {
  decodeParam,
  fetchChapter,
  fetchOwnerNovel,
  fetchVariables,
} from "@/lib/fiction-server";

/**
 * The chapter editor route.
 *
 * The server fetches the chapter as its OWNER, which is the case where the API
 * returns every representation - prose, messages, and entries - so the editor
 * can show the writer that changing presentation destroyed nothing
 * (docs/CONTENT-MODEL.md §6).
 */

export const metadata: Metadata = {
  title: "เขียนตอน",
  robots: { index: false, follow: false },
};

export default async function ChapterEditorPage({
  params,
}: PageProps<"/studio/novels/[ref]/chapters/[chapterRef]">) {
  const { ref: rawRef, chapterRef: rawChapter } = await params;
  const ref = decodeParam(rawRef);
  const chapterRef = decodeParam(rawChapter);

  const [novel, chapter, variables, characters] = await Promise.all([
    fetchOwnerNovel(ref),
    fetchChapter(ref, chapterRef),
    fetchVariables(ref),
    // The cast, so a headcanon entry can point at a real record (12F's
    // character_id). It returns an empty list on failure rather than throwing -
    // the manuscript must open whether or not a secondary read succeeded.
    fetchCharacters(ref),
  ]);
  if (!novel || !chapter) notFound();

  return (
    <ChapterEditor
      novelRef={novel.slug}
      novelTitle={novel.title}
      chapter={chapter}
      chapterUnit={novel.chapter_unit}
      variables={variables}
      characters={characters}
    />
  );
}
