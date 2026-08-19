import Link from "next/link";

import { AdSlot } from "@/components/ads/ad-slot";
import { Cover } from "@/components/fiction/cover";
import {
  DiscoverQuestions,
  type DiscoverColumn,
  type DiscoverNovel,
} from "@/components/fiction/discover-questions";
import { FormatBadges } from "@/components/fiction/format-badges";
import { NovelCoverCard, NovelRow } from "@/components/fiction/novel-card";
import { PageContainer } from "@/components/shell/page-container";
import { PromoCarousel } from "@/features/home/promo-carousel";
import { WriterSpotlight } from "@/features/home/writer-spotlight";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { SectionHeader } from "@/components/ui/section-header";
import { viewerAdFree } from "@/lib/ads-server";
import { serverGetMany } from "@/lib/api-server";
import { getCurrentUserOrNull } from "@/lib/auth";
import { fetchPublicFeed } from "@/lib/community-server";
import { fetchDesk } from "@/lib/desk-server";
import { relativeTime } from "@/lib/format";
import { fetchPromoSlides } from "@/lib/promo-server";
import { fetchWriterSpotlight } from "@/lib/writers-server";
import type { PromoSlide } from "@/types/promo";
import type { CommunityPost } from "@/types/community";
import type { Desk } from "@/types/desk";
import type { ContinueReadingEntry } from "@/types/library";
import type { Novel } from "@/types/novel";

/**
 * The home page.
 *
 * An edited front page, not a portal grid - and since the 2026-08 review, one
 * with a deliberate RHYTHM: hero → shortcut chips → resume strip → ranked
 * grid → writer band → dense update list BESIDE the community column → grid →
 * horizontal scroller → question columns → closing CTA. Two sections in a row
 * never share a shape, and (review round 5) the page is not allowed to become
 * a single stack of full-width rows: the update list and the community share
 * one row again, because three thin teasers across the whole measure was a
 * broken-looking use of a page's widest real estate.
 *
 * Guest-first (docs/10 §2.1): every shelf here is public data fetched without
 * credentials, so a visitor who has never signed in sees the whole page. The
 * only personal sections are "อ่านต่อ" and the writer CTA's resume variant.
 *
 * Every number on this page comes from a field the API returns. Read counts
 * appear only above the threshold the card family enforces; there is no
 * fabricated statistic anywhere on this page.
 *
 * Ad space is RESERVED at three fixed positions (review B) through AdSlot,
 * which renders nothing while ads are off platform-wide or for an ad-free
 * viewer - see components/ads/ad-slot.tsx for the binding placement rules.
 */

/** Public listings may be served up to this many seconds stale (docs/09 §32). */
const REVALIDATE_SECONDS = 60;

const SHELF_SIZE = 6;

async function loadShelf(
  query: Record<string, string | number>,
  perPage = SHELF_SIZE,
): Promise<Novel[]> {
  try {
    const { items } = await serverGetMany<Novel>("/novels", {
      query: { ...query, per_page: perPage },
      authenticated: false,
      revalidate: REVALIDATE_SECONDS,
    });
    return items;
  } catch {
    // One failed shelf must not blank the page (docs/05 §30).
    return [];
  }
}

/** The reader's own resume points. Absent for a guest, by design. */
async function loadContinueReading(signedIn: boolean): Promise<ContinueReadingEntry[]> {
  if (!signedIn) return [];
  try {
    const { items } = await serverGetMany<ContinueReadingEntry>("/me/reading-progress", {
      query: { per_page: 3 },
    });
    return items;
  } catch {
    return [];
  }
}

function discoverNovel(novel: Novel): DiscoverNovel {
  return {
    slug: novel.slug,
    title: novel.title,
    author: novel.author.display_name ?? novel.author.username,
    cover_url: novel.cover_url,
  };
}

export default async function HomePage() {
  const user = await getCurrentUserOrNull();

  const [popular, latest, updated, completed, headcanon, chat, community, resume, desk, adFree, promoSlides, writerSpotlight] =
    await Promise.all([
      loadShelf({ sort: "popular" }),
      loadShelf({ sort: "latest" }, 3),
      loadShelf({ sort: "updated" }, 6),
      loadShelf({ status: "completed", sort: "popular" }),
      loadShelf({ content_mode: "headcanon", sort: "updated" }),
      loadShelf({ presentation_format: "chat", sort: "updated" }),
      fetchPublicFeed(1),
      loadContinueReading(user !== null),
      user ? fetchDesk() : Promise.resolve(null),
      viewerAdFree(user !== null),
      fetchPromoSlides(),
      fetchWriterSpotlight(),
    ]);

  const featured = popular[0];
  const spotlight = latest.find((novel) => novel.id !== featured?.id);
  const posts = (community?.items ?? []).slice(0, 3);
  const empty = popular.length === 0 && updated.length === 0 && latest.length === 0;

  // The alternative-format shelf merges the two dimensions that share a shelf
  // header, de-duplicated because a fiction can be both.
  const alternative = [...headcanon, ...chat]
    .filter(
      (novel, index, all) => all.findIndex((item) => item.id === novel.id) === index,
    )
    .slice(0, SHELF_SIZE);

  const discoverColumns: DiscoverColumn[] = [
    {
      question: "อยากอ่านจบในคืนเดียว?",
      href: "/novels?preset=completed",
      pool: completed.map(discoverNovel),
    },
    {
      question: "อยากอ่านเป็นบทสนทนา?",
      href: "/novels?preset=chat",
      pool: chat.map(discoverNovel),
    },
    {
      question: "ตามเฮดแคนอนของใครอยู่?",
      href: "/novels?preset=headcanon",
      pool: headcanon.map(discoverNovel),
    },
  ].filter((column) => column.pool.length > 0);

  return (
    <main id="main">
      <PageContainer className="pt-7 pb-16">
        {empty && promoSlides.length === 0 ? (
          <EmptyState />
        ) : (
          <Hero
            featured={featured}
            spotlight={spotlight}
            slides={promoSlides}
            signedIn={user !== null}
          />
        )}

        {/* Reserved ad position 1 (review B): under the hero, above the chips
            - never in the hero's own columns. */}
        <div className="mt-6 empty:mt-0">
          <AdSlot slot="home-leaderboard" adFree={adFree} />
        </div>

        <QuickEntry />

        {resume.length === 1 ? (
          <section aria-labelledby="resume-heading" className="mt-10">
            <SectionHeader
              id="resume-heading"
              title="อ่านต่อ"
              subLabel="Continue reading"
              href="/library"
              linkLabel="คลังของฉัน"
            />
            {/* One unfinished book gets a low full-width strip: a lone card in
                a three-column grid read as a loading failure (review A3). */}
            <ResumeStrip entry={resume[0]} />
          </section>
        ) : resume.length > 1 ? (
          <section aria-labelledby="resume-heading" className="mt-10">
            <SectionHeader
              id="resume-heading"
              title="อ่านต่อ"
              subLabel="Continue reading"
              href="/library"
              linkLabel="คลังของฉัน"
            />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resume.map((entry) => (
                <li key={entry.novel.id}>
                  <ResumeCard entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {popular.length > 0 ? (
          <Shelf
            id="popular"
            title="ยอดนิยม"
            // The window is stated (review E): this ranking is cumulative
            // bookmarks, not a trending feed - saying "ตอนนี้" over an
            // all-time count was a claim the data does not make.
            subLabel="Most bookmarked · นับจากบุ๊กมาร์กสะสมทั้งหมด"
            href="/novels?preset=popular"
            // The COMPLETE ranking, #1 included, even though #1 also leads the
            // hero (review round 2): a list that starts at 2 read as a missing
            // entry, and the hero says "อันดับ 1" so the repeat explains itself.
            novels={popular}
            rankFrom={1}
          />
        ) : null}

        {/* The writer band (review round 5, docs/WRITER-SPOTLIGHT.md): people
            between two shelves of covers - a different shape on purpose. */}
        <WriterSpotlight spotlight={writerSpotlight} signedIn={user !== null} />

        {/* One ROW, two columns (review round 5): the update list carries the
            width, the community rides beside it as the narrow column. Three
            thin teasers stretched across the full measure gave the least
            content the most space - this is the proportion that matches. */}
        {updated.length > 0 || posts.length > 0 ? (
          <div className="mt-14 grid items-start gap-x-10 gap-y-12 lg:grid-cols-[1.55fr_1fr]">
            {updated.length > 0 ? (
              <section aria-labelledby="updated-heading" className="min-w-0">
                <SectionHeader
                  id="updated-heading"
                  title="อัปเดตล่าสุด"
                  subLabel="Recently updated"
                  href="/novels?preset=updated"
                />
                <ul className="-mx-2 divide-y divide-hairline">
                  {updated.map((novel) => (
                    <li key={novel.id}>
                      <NovelRow novel={novel} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {posts.length > 0 ? (
              <section aria-labelledby="community-heading" className="min-w-0">
                <SectionHeader
                  id="community-heading"
                  title="ในชุมชน"
                  subLabel="Around the stories"
                  href="/community"
                />
                <ul className="flex flex-col gap-3">
                  {posts.map((post) => (
                    <li key={post.id}>
                      <CommunityTeaser post={post} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {/* Reserved ad position 2 (review B): between sections, mid-page. */}
        <div className="mt-14 empty:mt-0">
          <AdSlot slot="home-inline" adFree={adFree} />
        </div>

        {completed.length > 0 ? (
          <Shelf
            id="completed"
            title="จบแล้ว อ่านรวดเดียว"
            subLabel="Complete · binge in one sitting"
            href="/novels?preset=completed"
            novels={completed}
          />
        ) : null}

        {/* A horizontal scroller, deliberately a different shape from the
            grids above it (review A1) - the shelf a reader flicks through
            rather than scans. Its cards take EXACTLY the column width of the
            grids (review round 5): a fixed w-36 here made these covers a
            different size from ยอดนิยม's, and two sizes of the same card read
            as two different things. (100% - gaps) / columns, per breakpoint. */}
        {alternative.length > 0 ? (
          <section aria-labelledby="alternative-heading" className="mt-14">
            <SectionHeader
              id="alternative-heading"
              title="แชทฟิกและเฮดแคนอน"
              subLabel="Chat & headcanon"
              href="/novels?preset=headcanon"
            />
            <ul className="flex snap-x gap-4 overflow-x-auto pb-2">
              {alternative.map((novel) => (
                <li
                  key={novel.id}
                  className="w-[calc((100%-16px)/2)] shrink-0 snap-start sm:w-[calc((100%-32px)/3)] lg:w-[calc((100%-80px)/6)]"
                >
                  <NovelCoverCard novel={novel} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {discoverColumns.length > 0 ? (
          <section aria-labelledby="discover-heading" className="mt-14">
            <SectionHeader
              id="discover-heading"
              title="ค้นพบเรื่องใหม่"
              subLabel="Discover · pick a mood"
            />
            <DiscoverQuestions columns={discoverColumns} />
          </section>
        ) : null}

        {/* Reserved ad position 3 (review B): ABOVE the closing CTA - the
            invitation to write stays the last thing on the page. */}
        <div className="mt-14 empty:mt-0">
          <AdSlot slot="home-footer" adFree={adFree} />
        </div>

        <WriterInvitation signedIn={user !== null} desk={desk} />
      </PageContainer>
    </main>
  );
}

/**
 * The hero (review A4+A5, carousel added per docs/HOME-PROMO.md).
 *
 * LEFT: the staff's slide queue when it has anything live; the automatic
 * "อันดับ 1 ยอดนิยม" banner when it does not, so an unstaffed install never
 * shows a hole.
 *
 * RIGHT: the automatic "มาใหม่ · นักเขียนหน้าใหม่" pick. NOT FOR SALE, ever
 * (docs/HOME-PROMO.md) - this slot is the counterweight that keeps a writer
 * with no budget reachable on the front page.
 */
function Hero({
  featured,
  spotlight,
  slides,
  signedIn,
}: {
  featured?: Novel;
  spotlight?: Novel;
  slides: PromoSlide[];
  signedIn: boolean;
}) {
  return (
    <section aria-label="แนะนำ" className="grid gap-3.5 lg:grid-cols-[1.55fr_1fr]">
      {slides.length > 0 ? (
        <PromoCarousel slides={slides} />
      ) : featured ? (
        <Link
          href={`/novel/${encodeURIComponent(featured.slug)}`}
          className="group relative flex min-h-58 flex-col justify-end overflow-hidden rounded-xl border border-border bg-surface-secondary p-6"
        >
          <span aria-hidden="true" className="art-placeholder absolute inset-0" />
          {featured.cover_url ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center opacity-25"
              style={{ backgroundImage: `url(${featured.cover_url})` }}
            />
          ) : null}
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#292731]/72 via-[#292731]/25 to-transparent"
          />

          <span className="relative">
            <span className="mono-label text-white/75">
              เรื่องเด่น · อันดับ 1 ยอดนิยม
            </span>
            <span className="mt-2 block font-serif text-2xl leading-snug font-semibold text-white">
              {featured.title}
            </span>
            <span className="mt-1.5 block text-sm text-white/80">
              โดย {featured.author.display_name ?? featured.author.username}
            </span>
            <span className="mt-4 inline-flex min-h-9 items-center rounded-md bg-white px-4 text-sm font-medium text-[#292731] group-hover:bg-white/90">
              เริ่มอ่าน
            </span>
          </span>
        </Link>
      ) : (
        <div className="min-h-58 rounded-xl border border-dashed border-border" />
      )}

      {spotlight ? (
        <Link
          href={`/novel/${encodeURIComponent(spotlight.slug)}`}
          // min-h matches the carousel column, and the cover is sized to FILL
          // that height (review round 5): a w-20 thumbnail left the bottom
          // third of this card empty, and the emptiness read as a mistake.
          className="group flex min-h-58 gap-5 rounded-xl border border-border bg-surface p-5 hover:border-primary-200"
        >
          <Cover
            url={spotlight.cover_url}
            title={spotlight.title}
            className="w-28 shrink-0 self-center md:w-32"
            showFallbackLabel={false}
          />
          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="mono-label text-primary">มาใหม่ · นักเขียนหน้าใหม่</span>
            <span className="mt-2 block font-serif text-lg leading-snug font-semibold group-hover:text-primary">
              <span className="line-clamp-2">{spotlight.title}</span>
            </span>
            <span className="mt-1.5 block text-sm text-text-secondary">
              โดย {spotlight.author.display_name ?? spotlight.author.username} -
              ตามเรื่องตั้งแต่ตอนแรกก่อนใคร
            </span>
            <span className="mt-2.5 block">
              <FormatBadges
                format={spotlight}
                mixed={spotlight.has_mixed_formats}
              />
            </span>
            <span className="mt-4 inline-flex min-h-9 w-fit items-center rounded-md border border-border px-3.5 text-sm text-text-secondary group-hover:border-primary-200 group-hover:text-text">
              เริ่มอ่านตอนแรก
            </span>
          </span>
        </Link>
      ) : (
        <Link
          href={signedIn ? "/studio/novels/new" : "/register"}
          className="group rounded-xl border border-secondary-300 bg-secondary-50 p-5 hover:border-secondary"
        >
          <p className="mono-label text-secondary-600">สำหรับนักเขียน</p>
          <p className="mt-2 font-serif text-lg leading-snug font-semibold">
            เริ่มเรื่องของคุณวันนี้
          </p>
          <p className="mt-1.5 text-sm text-text-secondary">
            ร้อยแก้ว แชท หรือเฮดแคนอน - เลือกได้ และเปลี่ยนภายหลังได้
          </p>
        </Link>
      )}
    </section>
  );
}

/** Shown only when nothing loaded at all - an outage, or a brand-new install. */
function EmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-serif text-lg font-semibold">ยังไม่มีนิยายให้แสดงตอนนี้</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
        อาจเป็นเพราะยังไม่มีผลงานที่เผยแพร่ หรือระบบกำลังมีปัญหาชั่วคราว
        ลองใหม่อีกครั้งในภายหลัง
      </p>
      <Link
        href="/studio/novels/new"
        className="mt-5 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
      >
        เริ่มเขียนเรื่องแรก
      </Link>
    </section>
  );
}

/**
 * Quick entry points.
 *
 * Each chip is a real listing query, so the row is navigation rather than
 * decoration. The leading label says WHERE the chips go (review A6): without
 * it they read as filters for this page, and a click that navigates away from
 * a page you thought you were filtering feels like a malfunction.
 */
const QUICK_ENTRIES = [
  { href: "/novels?preset=popular", label: "ยอดนิยม" },
  { href: "/novels?preset=latest", label: "มาใหม่" },
  { href: "/novels?preset=completed", label: "จบแล้ว" },
  { href: "/novels?preset=oneshot", label: "จบในตอน" },
  { href: "/novels?preset=chat", label: "แชทล้วน" },
  { href: "/novels?preset=headcanon", label: "เฮดแคนอน" },
];

function QuickEntry() {
  return (
    <nav
      aria-label="ทางลัดไปหน้ารวมเรื่อง"
      className="mt-6 flex flex-wrap items-center gap-2"
    >
      <span className="mono-label me-1 text-text-muted">ไปหน้ารวม:</span>
      <Chip href="/explore" selected>
        ทุกหมวด
      </Chip>
      {QUICK_ENTRIES.map((entry) => (
        <Chip key={entry.href} href={entry.href}>
          {entry.label}
        </Chip>
      ))}
    </nav>
  );
}

function Shelf({
  id,
  title,
  subLabel,
  href,
  novels,
  rankFrom,
}: {
  id: string;
  title: string;
  subLabel: string;
  href: string;
  novels: Novel[];
  /** First card's rank on a ranked shelf; unranked shelves omit it. */
  rankFrom?: number;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-14">
      <SectionHeader id={`${id}-heading`} title={title} subLabel={subLabel} href={href} />
      {/* Six columns everywhere (review A2). A short row leaves gaps at the
          end rather than stretching cards to fill - grid does that for free. */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
        {novels.map((novel, index) => (
          <li key={novel.id}>
            <NovelCoverCard
              novel={novel}
              rank={rankFrom !== undefined ? rankFrom + index : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function resumeTarget(entry: ContinueReadingEntry): string {
  const { novel, chapter } = entry;
  // Without a live chapter the fiction still resumes - at its own page, which
  // is where the reader can pick a chapter that still exists (docs/08 §3).
  return chapter
    ? `/read/${encodeURIComponent(novel.slug)}/${encodeURIComponent(chapter.slug)}`
    : `/novel/${encodeURIComponent(novel.slug)}`;
}

function ResumeCard({ entry }: { entry: ContinueReadingEntry }) {
  const { novel, chapter, progress_percent: percent } = entry;

  return (
    <Link
      href={resumeTarget(entry)}
      className="group block rounded-lg border border-border bg-surface p-3 hover:border-primary-200"
    >
      <div className="flex gap-3">
        <Cover
          url={novel.cover_url}
          title={novel.title}
          className="w-11"
          showFallbackLabel={false}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-sm font-semibold group-hover:text-primary">
            {novel.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {chapter
              ? `ตอนที่ ${chapter.chapter_number}${chapter.title ? ` · ${chapter.title}` : ""}`
              : "ตอนที่อ่านค้างไว้ไม่พร้อมให้อ่านแล้ว"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            อ่านค้างไว้ {Math.round(percent)}%
          </p>
        </div>
      </div>

      {/* The bar echoes the percentage already written above it, so the meaning
          never depends on reading a graphic (docs/05 §31). */}
      <div
        aria-hidden="true"
        className="mt-3 h-0.75 overflow-hidden rounded-full bg-surface-secondary"
      >
        <div className="h-full bg-primary" style={{ width: `${Math.round(percent)}%` }} />
      </div>
    </Link>
  );
}

/** The one-book resume: a low full-width strip instead of a lonely grid cell. */
function ResumeStrip({ entry }: { entry: ContinueReadingEntry }) {
  const { novel, chapter, progress_percent: percent } = entry;

  return (
    <Link
      href={resumeTarget(entry)}
      className="group flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 hover:border-primary-200"
    >
      <Cover
        url={novel.cover_url}
        title={novel.title}
        className="w-10 shrink-0"
        showFallbackLabel={false}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-sm font-semibold group-hover:text-primary">
          {novel.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">
          {chapter
            ? `ตอนที่ ${chapter.chapter_number}${chapter.title ? ` · ${chapter.title}` : ""}`
            : "ตอนที่อ่านค้างไว้ไม่พร้อมให้อ่านแล้ว"}
        </span>
      </span>
      <span className="hidden w-40 shrink-0 items-center gap-2 sm:flex">
        <span
          aria-hidden="true"
          className="h-0.75 flex-1 overflow-hidden rounded-full bg-surface-secondary"
        >
          <span
            className="block h-full bg-primary"
            style={{ width: `${Math.round(percent)}%` }}
          />
        </span>
        <span className="text-xs text-text-muted tabular-nums">
          {Math.round(percent)}%
        </span>
      </span>
      <span className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm text-text-secondary group-hover:border-primary-200 group-hover:text-text">
        อ่านต่อ
        <Icon name="arrow-right" size={14} />
      </span>
    </Link>
  );
}

function CommunityTeaser({ post }: { post: CommunityPost }) {
  const name = post.author.display_name ?? post.author.username;

  return (
    <Link
      href={`/community/post/${encodeURIComponent(post.id)}`}
      className="block rounded-lg border border-border bg-surface p-4 hover:border-primary-200"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-text-muted">{relativeTime(post.created_at)}</span>
      </p>
      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-text-secondary">
        {post.content}
      </p>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
        <Icon name="heart" size={14} className="text-secondary" />
        {post.reaction_count}
      </p>
    </Link>
  );
}

/**
 * The closing CTA - aware of who is reading it (review E). A visitor gets the
 * invitation to start; a writer with an unfinished chapter gets the door back
 * into it, because "มีเรื่องอยู่ในหัวแล้ว แต่ยังไม่รู้จะเริ่มตรงไหน" is the
 * wrong sentence to say to someone who is 4,000 words in.
 */
function WriterInvitation({
  signedIn,
  desk,
}: {
  signedIn: boolean;
  desk: Desk | null;
}) {
  const resume = desk?.resume;

  if (resume) {
    return (
      <section className="mt-16 flex flex-col items-center gap-6 rounded-xl border border-primary-200 bg-primary-50 px-6 py-8 text-center sm:flex-row sm:text-start">
        <div className="min-w-0 flex-1">
          <p className="mono-label">เขียนต่อจากที่ค้าง</p>
          {/* The chapter alone (review round 2): title · chapter overflowed
              two lines for any real novel name. The novel gets the line below. */}
          <h2 className="mt-2.5 truncate font-serif text-xl font-semibold tracking-tight">
            {resume.chapter_label} รอคุณอยู่
          </h2>
          <p className="mt-2.5 max-w-lg truncate text-sm leading-relaxed text-text-secondary">
            จากเรื่อง {resume.novel_title} · แตะล่าสุด {relativeTime(resume.updated_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2.5">
          <Link
            href={`/studio/novels/${encodeURIComponent(resume.novel_slug)}/chapters/${encodeURIComponent(resume.chapter_slug)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-white hover:opacity-90"
          >
            เขียนต่อ
          </Link>
          <Link
            href="/studio"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary-200 bg-surface px-5 text-sm text-primary hover:border-primary"
          >
            ไปสตูดิโอ
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-16 flex flex-col items-center gap-6 rounded-xl border border-primary-200 bg-primary-50 px-6 py-8 text-center sm:flex-row sm:text-start">
      <div className="flex-1">
        <p className="mono-label">เริ่มเขียนวันนี้</p>
        <h2 className="mt-2.5 font-serif text-xl font-semibold tracking-tight">
          มีเรื่องอยู่ในหัวแล้ว แต่ยังไม่รู้จะเริ่มตรงไหน
        </h2>
        <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-text-secondary">
          เลือกรูปแบบที่อยากเขียน - ร้อยแก้ว แชท หรือเฮดแคนอน
          เปลี่ยนรูปแบบการแสดงผลภายหลังได้โดยไม่มีการแก้ไขต้นฉบับของคุณแม้แต่ตัวเดียว
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2.5">
        <Link
          href={signedIn ? "/studio/novels/new" : "/register"}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-white hover:opacity-90"
        >
          {signedIn ? "สร้างผลงานชิ้นแรก" : "สมัครเพื่อเริ่มเขียน"}
        </Link>
        <Link
          href="/studio"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary-200 bg-surface px-5 text-sm text-primary hover:border-primary"
        >
          ดูสตูดิโอนักเขียน
        </Link>
      </div>
    </section>
  );
}
