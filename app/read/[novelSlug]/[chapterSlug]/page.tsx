import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatView } from "@/components/reader/chat-view";
import { DerivedChatView } from "@/components/reader/derived-chat-view";
import { HeadcanonView } from "@/components/reader/headcanon-view";
import { ProseView } from "@/components/reader/prose-view";
import { slotsFor } from "@/components/reader/variable-text";
import { Icon } from "@/components/ui/icon";
import { CommentSection } from "@/features/comments/comment-section";
import { LikeButton } from "@/features/library/like-button";
import { ReportButton } from "@/features/moderation/report-button";
import { ProgressTracker } from "@/features/reader/progress-tracker";
import { ReaderChrome } from "@/features/reader/reader-chrome";
import { VariableSubstitution } from "@/features/reader/variable-substitution";
import {
  decodeParam,
  fetchChapter,
  fetchChapters,
  fetchNovel,
  fetchVariables,
} from "@/lib/fiction-server";
import { chapterLabel, count, readingMinutes } from "@/lib/format";
import { hasDialogue } from "@/lib/prose-chat";
import { readerKindForFormat } from "@/types/fiction";
import type { Chapter } from "@/types/novel";
import type { NovelVariable } from "@/types/variable";

/**
 * The Reader - docs/03 §11 `/read/[novelSlug]/[chapterSlug]`.
 *
 * The highest-traffic page on the platform, so it is a Server Component on the
 * public-first fetch path: a guest reading a published chapter causes no
 * session work, and the responses are cacheable (docs/07 §67, docs/11 §12).
 * The chapter text itself ships no JavaScript; the only client code is the
 * invisible progress tracker and the chrome around the text.
 *
 * WHICH representation renders is decided by the API, not here: a reader's
 * chapter carries exactly one of `content`, `messages`, or `entries` - the
 * chapter's active presentation (docs/CONTENT-MODEL.md §6). This page renders
 * what `active_format` names and never re-derives the rule (docs/09 §51),
 * which is what lets a mixed fiction render each chapter correctly.
 */

interface PageProps {
  params: Promise<{ novelSlug: string; chapterSlug: string }>;
  /**
   * `?mode=chat` asks for the derived conversation (§13O). A URL rather than a
   * client toggle: the choice stays server-rendered, so the reading surface
   * still ships no JavaScript, and a reader can link someone to the view they
   * are actually looking at.
   */
  searchParams: Promise<{ mode?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { novelSlug, chapterSlug } = await params;
  const [novel, chapter] = await Promise.all([
    fetchNovel(decodeParam(novelSlug)),
    fetchChapter(decodeParam(novelSlug), decodeParam(chapterSlug)),
  ]);
  // Thrown HERE so the 404 STATUS is committed before streaming begins - from
  // the page body it would arrive after the 200 header.
  if (!novel || !chapter) notFound();

  const chapterName =
    chapter.title ?? chapterLabel(novel.chapter_unit, chapter.chapter_number);
  return {
    title: `${chapterName} - ${novel.title}`,
    robots: novel.visibility && novel.visibility !== "public" ? { index: false } : undefined,
  };
}

export default async function ReaderPage({ params, searchParams }: PageProps) {
  const { novelSlug: rawNovel, chapterSlug: rawChapter } = await params;
  const { mode } = await searchParams;
  const novelSlug = decodeParam(rawNovel);
  const chapterSlug = decodeParam(rawChapter);

  // The chapter cannot exist without its fiction, and both are needed - the
  // novel supplies the title, slugs, and navigation flag. The chapter list
  // feeds the table-of-contents drawer, so it is fetched with them rather than
  // on the reader's first tap.
  const [novel, chapter, chapters, variables] = await Promise.all([
    fetchNovel(novelSlug),
    fetchChapter(novelSlug, chapterSlug),
    fetchChapters(novelSlug),
    fetchVariables(novelSlug),
  ]);
  if (!novel || !chapter) notFound();

  const chapterName =
    chapter.title ?? chapterLabel(novel.chapter_unit, chapter.chapter_number);

  // อ่านแบบแชท is offered only where it means something (§13O): a prose
  // chapter that actually contains dialogue. The switch lives in the floating
  // toolbar now (reader toolbar review 2026-08), not above the text.
  const base = `/read/${encodeURIComponent(novel.slug)}/${encodeURIComponent(chapter.slug)}`;
  const offersChat =
    readerKindForFormat(chapter.active_format) === "standard" &&
    Boolean(chapter.content) &&
    hasDialogue(chapter.content ?? "");

  return (
    <ReaderChrome
      novelSlug={novel.slug}
      novelTitle={novel.title}
      chapterLabel={chapterName}
      currentChapterId={chapter.id}
      chapters={chapters ?? []}
      showChapterNav={novel.uses_chapter_navigation}
      chatToggle={
        offersChat
          ? { href: mode === "chat" ? base : `${base}?mode=chat`, active: mode === "chat" }
          : null
      }
      likeSlot={
        <LikeButton
          novelRef={novel.slug}
          initialCount={novel.like_count}
          hideCount={novel.hide_counts ?? false}
          compact
        />
      }
    >
      <main id="main" className="mx-auto w-full max-w-[var(--page-width)] px-5 py-10 sm:px-8">
        <header className="reading-surface mb-9 border-b border-reader-rule pb-7 text-center">
          {novel.uses_chapter_navigation ? (
            <p className="mono-label text-reader-muted">
              {chapterLabel(novel.chapter_unit, chapter.chapter_number)} · Chapter{" "}
              {chapter.chapter_number}
            </p>
          ) : null}
          <h1 className="mt-2.5 font-serif text-[26px] leading-tight font-semibold tracking-tight sm:text-[32px]">
            {chapterName}
          </h1>
          <p className="mt-3 text-sm text-reader-muted">
            {novel.author.display_name ?? novel.author.username}
            {chapter.word_count > 0 ? (
              <>
                {" · "}
                {count(chapter.word_count)} คำ · ~{readingMinutes(chapter.word_count)} นาที
              </>
            ) : null}
          </p>
        </header>

        <ChapterContent
          chapter={chapter}
          variables={variables}
          asChat={mode === "chat"}
        />

        {/* Fills the slots the server already emitted. Renders nothing, and the
            text above stays server-rendered with no JavaScript of its own. */}
        {variables.length > 0 ? (
          <VariableSubstitution novelID={novel.id} variables={variables} />
        ) : null}

        <ChapterNav
          novelSlug={novel.slug}
          chapter={chapter}
          showList={novel.uses_chapter_navigation}
        />

        {/* Below the reading flow, beside the thread: reporting THIS chapter
            (docs/11 §38 lists chapters as reportable). Kept out of the reading
            area - the reader stays distraction-free (docs/03 §11). */}
        <div className="mx-auto mt-8 flex max-w-[var(--reading-width)] justify-end">
          <ReportButton targetType="chapter" targetId={chapter.id} compact />
        </div>

        {/* This chapter's thread, after the reading flow ends (docs/03 §11:
            the reader is distraction-free; discussion comes below the fold). */}
        <div className="mx-auto max-w-[var(--reading-width)]">
          <CommentSection
            novelRef={novel.slug}
            chapterRef={chapter.slug}
            access={novel.comment_access}
            approval={novel.comment_approval}
          />
        </div>

        <ProgressTracker novelId={novel.id} chapterId={chapter.id} />
      </main>
    </ReaderChrome>
  );
}

function ChapterContent({
  chapter,
  variables,
  asChat = false,
}: {
  chapter: Chapter;
  variables: NovelVariable[];
  asChat?: boolean;
}) {
  const slots = slotsFor(variables);

  // The server already resolved which representation is active, including the
  // per-chapter answer a mixed fiction gives (§13J). Branching on it rather
  // than on "whichever field is non-null" matters for an OWNER previewing:
  // they receive all three, and guessing would show them the wrong one.
  switch (readerKindForFormat(chapter.active_format)) {
    case "chat":
      if (chapter.messages && chapter.messages.length > 0) {
        return <ChatView messages={chapter.messages} slots={slots} />;
      }
      break;
    case "headcanon":
      if (chapter.entries && chapter.entries.length > 0) {
        return (
          <HeadcanonView
            entries={chapter.entries}
            fields={chapter.entry_fields}
            slots={slots}
          />
        );
      }
      break;
    case "standard":
      if (chapter.content) {
        // The reader asked to see the dialogue laid out. Derived at render
        // time, stored nowhere - the prose above is still the whole chapter.
        if (asChat) {
          return <DerivedChatView content={chapter.content} slots={slots} />;
        }
        return (
          <ProseView
            content={chapter.content}
            format={chapter.content_format}
            slots={slots}
          />
        );
      }
      break;
    default:
      // A format this build does not know about degrades to a message rather
      // than to a crash or to the wrong content (docs/09 §52).
      return (
        <p className="text-center text-sm text-reader-muted">
          ตอนนี้ใช้รูปแบบที่แอปเวอร์ชันนี้ยังไม่รองรับ
        </p>
      );
  }

  return (
    <p className="text-center text-sm text-reader-muted">
      ตอนนี้ยังไม่มีเนื้อหาในรูปแบบที่เลือกไว้
    </p>
  );
}

/**
 * Previous / next navigation (docs/03 §11 Reader controls).
 *
 * Neighbour links use chapter IDs - the API accepts an id anywhere it accepts
 * a slug, so the link is correct without a second lookup.
 *
 * The next chapter is a full-width invitation rather than a matching pair of
 * arrows: finishing a chapter and starting the next one is the single most
 * common thing a reader does, and the layout should say so.
 */
function ChapterNav({
  novelSlug,
  chapter,
  showList,
}: {
  novelSlug: string;
  chapter: Chapter;
  showList: boolean;
}) {
  if (!showList && !chapter.previous_chapter_id && !chapter.next_chapter_id) return null;

  const base = `/read/${encodeURIComponent(novelSlug)}`;

  return (
    <nav
      aria-label="ตอนก่อนหน้าและถัดไป"
      className="mx-auto mt-12 flex max-w-[var(--reading-width)] flex-col gap-4"
    >
      {chapter.next_chapter_id ? (
        <Link
          href={`${base}/${chapter.next_chapter_id}`}
          className="flex items-center justify-between gap-4 rounded-lg bg-primary px-5 py-4 text-white hover:opacity-95"
        >
          <span>
            <span className="mono-label block text-white">ต่อไป</span>
            <span className="mt-1 block font-serif text-lg font-semibold">
              อ่านตอนถัดไป
            </span>
          </span>
          <Icon name="arrow-right" size={20} />
        </Link>
      ) : (
        <p className="rounded-lg border border-dashed border-reader-rule px-5 py-4 text-center text-sm text-reader-muted">
          จบเท่าที่มีตอนนี้ - ติดตามนักเขียนไว้เพื่อรู้เมื่อมีตอนใหม่
        </p>
      )}

      <div className="flex items-center justify-between gap-4 text-sm">
        {chapter.previous_chapter_id ? (
          <Link
            href={`${base}/${chapter.previous_chapter_id}`}
            className="flex items-center gap-1 text-reader-muted hover:text-reader-text"
          >
            <Icon name="chevron-left" size={16} />
            ตอนก่อนหน้า
          </Link>
        ) : (
          <span aria-hidden />
        )}

        {showList ? (
          <Link
            href={`/novel/${encodeURIComponent(novelSlug)}#chapters`}
            className="text-reader-muted hover:text-reader-text"
          >
            สารบัญทั้งหมด
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
