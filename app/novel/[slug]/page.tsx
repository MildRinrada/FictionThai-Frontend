import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AboutTabs } from "@/components/fiction/about-tabs";
import { RightsCard } from "@/components/fiction/rights-card";
import { CharacterSection } from "@/components/fiction/character-section";
import { Cover } from "@/components/fiction/cover";
import { FormatBadges } from "@/components/fiction/format-badges";
import { NovelCoverCard } from "@/components/fiction/novel-card";
import { PageContainer } from "@/components/shell/page-container";
import { Icon } from "@/components/ui/icon";
import { SectionHeader } from "@/components/ui/section-header";
import { DonateButton } from "@/features/author/donate-button";
import { CommentSection } from "@/features/comments/comment-section";
import { BookmarkButton } from "@/features/library/bookmark-button";
import { FollowButton } from "@/features/library/follow-button";
import { LikeButton } from "@/features/library/like-button";
import { CoverUpload } from "@/features/media/cover-upload";
import { ReportButton } from "@/features/moderation/report-button";
import { StartReading } from "@/features/reader/start-reading";
import { VariableControl } from "@/features/reader/variable-control";
import { serverGetMany } from "@/lib/api-server";
import { fetchCharacters } from "@/lib/characters-server";
import {
  decodeParam,
  fetchChapters,
  fetchNovel,
  fetchVariables,
} from "@/lib/fiction-server";
import {
  absoluteDate,
  chapterLabel,
  count,
  readingMinutes,
  relativeTime,
} from "@/lib/format";
import { AgeRating, type ChapterSummary, type Novel } from "@/types/novel";

/**
 * The fiction page - docs/03 §10 `/novel/[slug]`.
 *
 * A Server Component on the public-first fetch path: readers and guests get a
 * cacheable render with no session work (docs/11 §12), and everything personal
 * - bookmark state, follow state, the reader's own position - lives in client
 * islands that ask the API for the caller's own state after mount.
 *
 * The page adapts to the fiction's format from the SERVER's metadata: badges
 * from the format dimensions, chapter navigation only when the API says so
 * (docs/09 §51 - clients never re-derive format rules).
 *
 * Composition: a hero that gives the cover real size, then everything else
 * visible on one page. There are deliberately no tabs - a reader deciding
 * whether to start should not have to hunt for the synopsis or the chapter
 * list, which is exactly what the tabbed competitor layouts make them do.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const novel = await fetchNovel(decodeParam(slug));
  // Thrown HERE, not only in the page: metadata resolves before streaming
  // begins, so this is the last moment a real 404 STATUS can still be sent.
  // From the page body it would arrive after the 200 header.
  if (!novel) notFound();

  // 18+ work is not sent to search engines and gets no social preview (§13B).
  //
  // The rule is about where a work turns up UNASKED. A link shared into a group
  // chat that unfurls the synopsis and the cover of an 18+ fiction shows it to
  // everyone in that chat, none of whom chose to open it - so the link stays a
  // link. Nothing here restricts reading it: the gate does that, and this is a
  // different question with a different answer.
  const adult =
    novel.age_rating === AgeRating.Mature || novel.age_rating === AgeRating.Explicit;

  // Owner previews of private work must never be indexed; published pages may
  // be. Visibility is only present for the owner, so its presence with a
  // non-public value marks a preview.
  const unpublished = Boolean(novel.visibility && novel.visibility !== "public");

  return {
    title: novel.title,
    description: adult ? undefined : (novel.description ?? undefined),
    robots: adult || unpublished ? { index: false, follow: !adult } : undefined,
    openGraph: adult ? undefined : { title: novel.title, type: "article" },
  };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "ฉบับร่าง",
  ongoing: "กำลังเผยแพร่",
  completed: "จบแล้ว",
  hiatus: "พักการเผยแพร่",
  cancelled: "ยกเลิก",
};

/** More by the same writer. A listing query, never a recommendation engine. */
async function loadMoreByAuthor(novel: Novel): Promise<Novel[]> {
  try {
    const { items } = await serverGetMany<Novel>("/novels", {
      query: { author: novel.author.username, per_page: 5, sort: "popular" },
      authenticated: false,
      revalidate: 60,
    });
    return items.filter((item) => item.id !== novel.id).slice(0, 4);
  } catch {
    return [];
  }
}

export default async function NovelPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeParam(rawSlug);

  const novel = await fetchNovel(slug);
  if (!novel) notFound();

  const [chapters, alsoBy, cast, variables] = await Promise.all([
    fetchChapters(slug).then((result) => result ?? []),
    loadMoreByAuthor(novel),
    fetchCharacters(slug),
    fetchVariables(slug),
  ]);
  const firstChapter = chapters[0];
  const publishedWords = chapters.reduce((total, chapter) => total + chapter.word_count, 0);

  return (
    <main id="main">
      {/* The hero sits on surface white against the paper page, so the fiction
          reads as an object placed on the page rather than as another band.
          ธีมสีของเรื่อง (13U): the author's accent runs as a rule across the
          top of their own page - present when chosen, invisible when not. */}
      {novel.theme_color ? (
        <div aria-hidden className="h-1" style={{ backgroundColor: novel.theme_color }} />
      ) : null}
      <div className="border-b border-border bg-surface">
        <PageContainer className="py-8 sm:py-10">
          <div className="flex flex-col gap-7 sm:flex-row sm:gap-9">
            <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-50">
              <Cover url={novel.cover_url} title={novel.title} />
              <div className="mt-3">
                {/* Owner-only after the client-side ownership re-sync (Phase 9). */}
                <CoverUpload novelRef={novel.slug} initialIsOwner={novel.is_owner} />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <FormatBadges format={novel} />

              <h1 className="mt-3.5 font-serif text-[27px] leading-tight font-semibold tracking-tight sm:text-[33px]">
                {novel.title}
              </h1>

              {/* คำโปรย (§13S) - the author's own line, where a card shows it:
                  directly under the title, above everything administrative. */}
              {novel.tagline ? (
                <p className="mt-2.5 max-w-prose font-serif text-base leading-relaxed text-text-secondary italic">
                  {novel.tagline}
                </p>
              ) : null}

              <p className="mt-2.5 text-sm text-text-secondary">
                โดย{" "}
                <Link
                  href={`/novels?author=${encodeURIComponent(novel.author.username)}`}
                  className="font-medium text-text hover:text-primary"
                >
                  {novel.author.display_name ?? novel.author.username}
                </Link>
                {/* ผู้เขียนร่วม (13U) - the public credit, beside the author
                    where a byline belongs. */}
                {novel.collaborators?.length ? (
                  <>
                    {" "}
                    ร่วมกับ{" "}
                    {novel.collaborators.map((credit, index) => (
                      <span key={credit.username}>
                        {index > 0 ? ", " : ""}
                        <Link
                          href={`/users/${encodeURIComponent(credit.username)}`}
                          className="font-medium text-text hover:text-primary"
                        >
                          {credit.credit ||
                            credit.display_name ||
                            credit.username}
                        </Link>
                      </span>
                    ))}
                  </>
                ) : null}
              </p>

              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                {/* De-duplicated per reader per day (docs/PHASE-12 §12C) -
                    a readership figure, not a hit counter. ซ่อนตัวเลข (13U):
                    when the author keeps the scoreboard off, the cells are
                    ABSENT - the server zeroes the numbers, and rendering
                    three zeros would misreport a choice as emptiness. */}
                {!novel.counts_hidden ? (
                  <>
                    <Stat label="ผู้อ่าน" value={count(novel.view_count)} />
                    <Stat label="ถูกใจ" value={count(novel.like_count)} />
                    <Stat label="บันทึกไว้อ่าน" value={count(novel.bookmark_count)} />
                  </>
                ) : null}
                <Stat
                  label="สถานะ"
                  value={STATUS_LABELS[novel.status] ?? novel.status}
                />
                <Stat
                  label={novel.uses_chapter_navigation ? "ตอนที่อ่านได้" : "รูปแบบ"}
                  value={
                    novel.uses_chapter_navigation
                      ? `${count(novel.chapter_count)} ตอน`
                      : "จบในตอน"
                  }
                />
                {publishedWords > 0 ? (
                  <Stat
                    label="ความยาว"
                    value={`${count(publishedWords)} คำ · ~${count(readingMinutes(publishedWords))} นาที`}
                  />
                ) : null}
                <Stat label="อัปเดตล่าสุด" value={relativeTime(novel.updated_at)} />
              </dl>

              {/*
                One clear action hierarchy: read, then keep, then support, then
                the quiet administrative actions. Reading is the only filled
                button on the page.
              */}
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <StartReading
                  novelId={novel.id}
                  novelSlug={novel.slug}
                  firstChapterSlug={firstChapter?.slug}
                />
                <BookmarkButton novelRef={novel.slug} />
                <LikeButton
                  novelRef={novel.slug}
                  initialCount={novel.like_count}
                  hideCount={novel.counts_hidden}
                />
                <FollowButton authorId={novel.author.id} hidden={novel.is_owner} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                {/* External writer-support link (Phase 11) - pays the WRITER via
                    their own EasyDonate, never FictionThai. Distinct from
                    "สมัคร Premium". */}
                <DonateButton donationUrl={novel.author.donation_url} hidden={novel.is_owner} />
                {/* docs/02 §37 lists Report among fiction actions. */}
                <ReportButton targetType="novel" targetId={novel.id} />
              </div>

              {novel.is_owner ? <OwnerStrip novel={novel} /> : null}
            </div>
          </div>
        </PageContainer>
      </div>

      <PageContainer className="py-10 pb-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_312px]">
          <div className="min-w-0">
            {novel.content_warning ? (
              novel.content_warning_spoiler ? (
                /* ซ่อนกันสปอยล์ (13U): the author folded the warning behind a
                   click. A <details> element - server-rendered, zero JS, and
                   the reader still gets the warning BEFORE any text. */
                <details className="mb-7 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm">
                  <summary className="flex cursor-pointer items-center gap-2.5 text-warning">
                    <Icon name="alert" size={17} className="shrink-0" />
                    <span className="font-medium">
                      คำเตือนเนื้อหา - กดเพื่อดู (อาจสปอยล์)
                    </span>
                  </summary>
                  <p className="mt-2 ps-7 text-warning">{novel.content_warning}</p>
                </details>
              ) : (
                <p className="mb-7 flex gap-2.5 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
                  <Icon name="alert" size={17} className="mt-0.5" />
                  <span>
                    <span className="font-medium">คำเตือนเนื้อหา</span> - {novel.content_warning}
                  </span>
                </p>
              )
            ) : null}

            {/* The cast comes before the synopsis: the design's own judgement,
                and the right one - a reader deciding whether to start looks at
                who is in it before reading a blurb about it. */}
            <CharacterSection characters={cast} />

            {variables.length > 0 ? (
              <div className="mb-10">
                <VariableControl novelID={novel.id} variables={variables} />
              </div>
            ) : null}

            {/*
              เรื่องย่อ / บทนำ / จากผู้เขียน (§13S).

              บทนำ was going into chapter one, which meant a reader coming back
              for chapter twelve scrolled past it every time and a reader who
              wanted it afterwards could not find it. It is a field on the
              fiction now, and it shares a strip with the two things it sits
              beside rather than stacking a third block of prose above the
              chapter list.
            */}
            <AboutTabs
              panels={[
                novel.description
                  ? {
                      key: "synopsis",
                      label: "เรื่องย่อ",
                      subLabel: "Synopsis",
                      text: novel.description,
                    }
                  : null,
                novel.foreword
                  ? {
                      key: "foreword",
                      label: "บทนำ",
                      subLabel: "Foreword",
                      text: novel.foreword,
                    }
                  : null,
                novel.author_note_start
                  ? {
                      key: "note",
                      label: "จากผู้เขียน",
                      subLabel: "Author note",
                      text: novel.author_note_start,
                    }
                  : null,
              ].filter((panel) => panel !== null)}
            />

            {/* Discovery metadata (docs/08 §14, §15): each chip is a filter link,
                so a genre or tag is a way INTO more fiction, not just a label. */}
            {novel.genres.length > 0 || novel.tags.length > 0 ? (
              <div className="mb-10 flex flex-wrap gap-2" aria-label="หมวดหมู่และแท็ก">
                {novel.genres.map((genre) => (
                  <Link
                    key={genre.id}
                    href={`/search?genre=${encodeURIComponent(genre.slug)}`}
                    className="inline-flex min-h-7.5 items-center rounded-md border border-primary-200 px-3 text-xs text-primary hover:bg-primary-50"
                  >
                    {genre.name}
                  </Link>
                ))}
                {novel.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/search?tag=${encodeURIComponent(tag.slug)}`}
                    className="inline-flex min-h-7.5 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            ) : null}

            <ChapterList novel={novel} chapters={chapters} />

            {/* The fiction-level thread (docs/09 §20). Chapter discussion lives on
                the reader page, so this stays spoiler-safe for new readers. */}
            <div className="mt-12">
              <CommentSection
                novelRef={novel.slug}
                access={novel.comment_access}
                approval={novel.comment_approval}
              />
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <AuthorCard novel={novel} />

            {/* What the author allows (§13E). Beside the work rather than
                buried in it, because a reader deciding whether to quote or
                translate is deciding it here. */}
            <RightsCard
              rights={novel.rights}
              authorName={novel.author.display_name ?? novel.author.username}
            />

            {alsoBy.length > 0 ? (
              <section aria-labelledby="also-by-heading">
                <p id="also-by-heading" className="mono-label mb-3">
                  เรื่องอื่นของนักเขียนคนนี้
                </p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-5">
                  {alsoBy.map((item) => (
                    <li key={item.id}>
                      <NovelCoverCard novel={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      </PageContainer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mono-label">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

/**
 * The owner's controls, kept in one tinted strip.
 *
 * Rendered from the API's `is_owner`, so it never appears for a reader. It is
 * a shortcut into the studio, not a second editing surface - one place owns
 * writing (docs/06 §33).
 */
function OwnerStrip({ novel }: { novel: Novel }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2.5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
      <p className="mono-label me-2">มุมมองเจ้าของเรื่อง</p>
      <Link
        href={`/studio/novels/${encodeURIComponent(novel.slug)}`}
        className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90"
      >
        จัดการเรื่องนี้ในสตูดิโอ
      </Link>
      {novel.draft_chapter_count ? (
        <span className="text-xs text-text-secondary">
          มีฉบับร่างค้างอยู่ {count(novel.draft_chapter_count)} ตอน
        </span>
      ) : null}
    </div>
  );
}

function AuthorCard({ novel }: { novel: Novel }) {
  const name = novel.author.display_name ?? novel.author.username;

  return (
    <section
      aria-labelledby="author-card-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <p id="author-card-heading" className="mono-label">
        นักเขียน
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="art-placeholder flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
          {novel.author.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- object storage
            <img src={novel.author.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="user" size={18} className="text-text-muted" />
          )}
        </span>
        <div className="min-w-0">
          {/* The writer is a person with a page now (Phase 12E), not just a
              filter on a listing. */}
          <Link
            href={`/users/${encodeURIComponent(novel.author.username)}`}
            className="block truncate font-serif text-base font-semibold hover:text-primary"
          >
            {name}
          </Link>
          <p className="truncate text-xs text-text-muted">@{novel.author.username}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/users/${encodeURIComponent(novel.author.username)}`}
          className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
        >
          ดูโปรไฟล์
        </Link>
        <Link
          href={`/novels?author=${encodeURIComponent(novel.author.username)}`}
          className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
        >
          ผลงานทั้งหมด
        </Link>
      </div>
    </section>
  );
}

/**
 * The table of contents - shown as a list for chapter-navigated fiction, and
 * not at all for a one-shot with a single reading unit (docs/01 §7.1: the
 * reader UI should prioritise continuous reading for one-shots).
 */
function ChapterList({ novel, chapters }: { novel: Novel; chapters: ChapterSummary[] }) {
  if (!novel.uses_chapter_navigation || chapters.length === 0) return null;

  return (
    <section aria-labelledby="chapter-list-heading" id="chapters" className="scroll-mt-20">
      <SectionHeader
        id="chapter-list-heading"
        title="สารบัญ"
        subLabel={`${count(chapters.length)} chapters`}
      />

      <ol className="divide-y divide-hairline rounded-lg border border-border bg-surface">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <Link
              href={`/read/${encodeURIComponent(novel.slug)}/${encodeURIComponent(chapter.slug)}`}
              className="group flex items-baseline gap-4 px-4 py-3 hover:bg-surface-secondary"
            >
              <span className="w-11 shrink-0 font-mono text-xs text-text-muted tabular-nums">
                {chapter.chapter_number}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm group-hover:text-primary">
                  {chapter.title ?? chapterLabel(novel.chapter_unit, chapter.chapter_number)}
                </span>
                {chapter.word_count > 0 ? (
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {count(chapter.word_count)} คำ · ~{readingMinutes(chapter.word_count)} นาที
                  </span>
                ) : null}
              </span>

              <span className="shrink-0 text-xs text-text-muted">
                {chapter.status === "published"
                  ? relativeTime(chapter.published_at ?? chapter.updated_at)
                  : chapter.status === "scheduled"
                    ? `ตั้งเวลา ${absoluteDate(chapter.published_at)}`
                    : "ฉบับร่าง"}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
