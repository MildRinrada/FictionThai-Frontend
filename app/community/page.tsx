import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BetaSeekersPanel } from "@/components/community/beta-seekers-panel";
import { CommunityNav } from "@/components/community/community-nav";
import { DiscussedPanel } from "@/components/community/discussed-panel";
import { FeedPagination } from "@/components/community/feed-pagination";
import { PostCard } from "@/components/community/post-card";
import { RulesCard } from "@/components/community/rules-card";
import { TrendingTagsPanel } from "@/components/community/trending-tags-panel";
import { PageContainer } from "@/components/shell/page-container";
import { Chip } from "@/components/ui/chip";
import { InlineComposer } from "@/features/community/inline-composer";
import { PostSearch } from "@/features/community/post-search";
import { getCurrentUserOrNull } from "@/lib/auth";
import {
  isSearching,
  parseSearchInput,
  searchHref,
  searchStateOf,
  type SearchState,
} from "@/lib/community-search";
import {
  fetchBetaSeekers,
  fetchDiscussedFictions,
  fetchPostSearch,
  fetchPublicFeed,
  fetchTrendingTags,
  fetchViewerFeed,
} from "@/lib/community-server";
import { count } from "@/lib/format";
import type { ApiMeta } from "@/types/api";
import { POST_TYPES, type CommunityPost, type CommunityPostType } from "@/types/community";

/**
 * The community feed - three columns (docs/COMMUNITY-FEED.md):
 *
 *   left    the community's own navigation (feeds, saved, post-type entries)
 *   center  composer → post search → sort → feed → numbered pages
 *   right   discussed fictions, trending tags, beta seekers, the rules
 *
 * Guest-first where it can be: a guest's default feed is fetched WITHOUT
 * credentials, identical for every visitor, and cacheable (docs/14 §7). A
 * SIGNED-IN visitor's feed is fetched with their cookies instead, so every
 * card arrives knowing my_reaction/bookmarked and no card re-fetches itself.
 * Personal feeds (following/mine/saved) and personal search scopes redirect
 * guests to sign-in with their intent preserved.
 *
 * Search state lives in the URL (?q=&from=&range=…): the Server Component
 * parses and fetches, so a shared link reproduces the search exactly and the
 * island only ever *navigates*.
 */

export const metadata: Metadata = {
  title: "ชุมชน",
  description: "พูดคุย อัปเดตงานเขียน และแนะนำนิยายกับนักเขียนและนักอ่านคนอื่น",
};

/** The feeds the API supports (docs/COMMUNITY-FEED.md). */
type Feed = "all" | "following" | "attached" | "mine" | "saved";

const PERSONAL_FEEDS: Feed[] = ["following", "mine", "saved"];

function feedOf(raw: string | undefined): Feed {
  return raw === "following" || raw === "attached" || raw === "mine" || raw === "saved"
    ? raw
    : "all";
}

function typeOf(raw: string | undefined): CommunityPostType | undefined {
  return POST_TYPES.includes(raw as CommunityPostType)
    ? (raw as CommunityPostType)
    : undefined;
}

interface PageProps {
  searchParams: Promise<{
    feed?: string;
    page?: string;
    q?: string;
    from?: string;
    range?: string;
    has?: string;
    sort?: string;
    type?: string;
  }>;
}

/** Rebuilds the /community href for one page of the current view. */
function pageHref(
  params: { feed?: string; q?: string; from?: string; range?: string; has?: string; sort?: string; type?: string },
  page: number,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query === "" ? "/community" : `/community?${query}`;
}

export default async function CommunityPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const feed = feedOf(params.feed);
  const type = typeOf(params.type);
  const sort = params.sort === "top" ? ("top" as const) : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const state: SearchState = { ...searchStateOf(params), type };
  const searching = isSearching(state);

  const user = await getCurrentUserOrNull();
  const backHere = pageHref(
    {
      feed: feed === "all" ? undefined : feed,
      type,
      sort,
      q: state.q || undefined,
      from: state.from === "all" ? undefined : state.from,
      range: state.range === "all" ? undefined : state.range,
      has: state.has,
    },
    page,
  );
  if (!user) {
    const needsAccount =
      (searching && state.from !== "all") ||
      (!searching && PERSONAL_FEEDS.includes(feed));
    if (needsAccount) {
      redirect(`/login?next=${encodeURIComponent(backHere)}`);
    }
  }

  const [result, discussed, trendingTags, betaSeekers] = await Promise.all([
    searching
      ? fetchPostSearch(state, page, user !== null)
      : user
        ? fetchViewerFeed(page, { feed: feed === "all" ? undefined : feed, type, sort })
        : fetchPublicFeed(page, {
            feed: feed === "attached" ? "attached" : undefined,
            type,
            sort,
          }),
    fetchDiscussedFictions(),
    fetchTrendingTags(),
    fetchBetaSeekers(),
  ]);

  const selectedNav = searching
    ? ""
    : type === "beta_request"
      ? "beta"
      : type === "event"
        ? "event"
        : feed;

  const parsed = parseSearchInput(state.q);
  const highlight = parsed.tag ? `#${parsed.tag}` : parsed.text;

  const sortHrefFor = (nextSort?: "top") =>
    pageHref({ feed: feed === "all" ? undefined : feed, type, sort: nextSort }, 1);

  return (
    <main id="main">
      <PageContainer className="py-8 pb-16">
        <header className="border-b border-hairline pb-5">
          <p className="mono-label">Community</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight sm:text-[29px]">
            ชุมชน
          </h1>
          <p className="mt-2 max-w-prose text-sm text-text-secondary">
            คุยกันเรื่องที่กำลังอ่าน บอกต่อเรื่องที่ชอบ และตามความเคลื่อนไหวของนักเขียน
          </p>
        </header>

        <div className="mt-5 gap-6 lg:grid lg:grid-cols-[11.5rem_minmax(0,1fr)] xl:grid-cols-[11.5rem_minmax(0,1fr)_19rem]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <CommunityNav selected={selectedNav} />
          </div>

          <div className="mt-4 min-w-0 lg:mt-0">
            <InlineComposer />

            <div className="mt-4">
              <PostSearch
                key={`${state.q}|${state.from}|${state.range}|${state.has ?? ""}|${state.sort}`}
                state={state}
                active={searching}
                discussed={discussed}
              />
            </div>

            {searching ? (
              <SearchResultBar q={state.q} meta={result?.meta ?? null} />
            ) : (
              <nav aria-label="เรียงฟีด" className="mt-4 flex items-center gap-2">
                <Chip href={sortHrefFor(undefined)} selected={!sort}>
                  ใหม่สุด
                </Chip>
                <Chip href={sortHrefFor("top")} selected={sort === "top"}>
                  มีปฏิสัมพันธ์มากสุด
                </Chip>
              </nav>
            )}

            <div className="mt-4">
              <FeedBody
                result={result}
                feed={feed}
                type={type}
                searching={searching}
                state={state}
                highlight={highlight}
                hrefFor={(at) =>
                  pageHref(
                    {
                      feed: feed === "all" ? undefined : feed,
                      type,
                      sort: searching
                        ? state.sort === "top"
                          ? "top"
                          : undefined
                        : sort,
                      q: state.q || undefined,
                      from: state.from === "all" ? undefined : state.from,
                      range: state.range === "all" ? undefined : state.range,
                      has: state.has,
                    },
                    at,
                  )
                }
                page={page}
              />
            </div>
          </div>

          <aside className="mt-10 space-y-4 lg:col-start-2 lg:mt-8 xl:sticky xl:top-20 xl:col-start-3 xl:mt-0 xl:max-h-[calc(100vh-6rem)] xl:self-start xl:overflow-y-auto xl:pb-4">
            <DiscussedPanel items={discussed} />
            <TrendingTagsPanel items={trendingTags} />
            <BetaSeekersPanel items={betaSeekers} />
            <RulesCard />
          </aside>
        </div>
      </PageContainer>
    </main>
  );
}

function SearchResultBar({ q, meta }: { q: string; meta: ApiMeta | null }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm">
      <p className="min-w-0 truncate">
        {meta ? (
          <>
            พบ <span className="font-medium">{count(meta.total)}</span> โพสต์สำหรับ{" "}
            <span className="font-medium">“{q}”</span>
          </>
        ) : (
          <>ผลการค้นหา “{q}”</>
        )}
      </p>
      <Link
        href="/community"
        aria-label="ล้างการค้นหา กลับสู่ฟีด"
        className="shrink-0 text-xs text-text-secondary hover:text-primary"
      >
        ✕ ล้างการค้นหา
      </Link>
    </div>
  );
}

function EmptyFeed({ feed, type }: { feed: Feed; type?: CommunityPostType }) {
  if (type === "beta_request") {
    return (
      <>
        <p>ยังไม่มีใครประกาศหาเบต้าหรือนักเขียนร่วมตอนนี้</p>
        <p className="mt-2">
          กำลังหาอยู่หรือเปล่า? เขียนโพสต์แล้วเลือกประเภท “หาเบต้า/นักเขียนร่วม” ได้เลย
        </p>
      </>
    );
  }
  if (type === "event") {
    return <p>ยังไม่มีอีเวนต์เขียนที่กำลังประกาศอยู่</p>;
  }
  if (type) {
    return <p>ยังไม่มีโพสต์ประเภทนี้</p>;
  }

  if (feed === "following") {
    return (
      <>
        <p>ยังไม่มีโพสต์จากคนที่คุณติดตาม</p>
        <p className="mt-2">
          ติดตามนักเขียนที่ชอบจากหน้า{" "}
          <Link href="/explore" className="text-primary hover:underline">
            สำรวจ
          </Link>{" "}
          เพื่อเห็นโพสต์ของพวกเขาที่นี่
        </p>
      </>
    );
  }

  if (feed === "attached") {
    return (
      <>
        <p>ยังไม่มีโพสต์ที่แนบเรื่องมาด้วย</p>
        <p className="mt-2">
          เวลาเล่าถึงตอนที่เพิ่งอ่าน กด “แนบตอน” ในช่องเขียนโพสต์ แล้วคนอ่านจะกดอ่านต่อได้ทันที
        </p>
      </>
    );
  }

  if (feed === "mine") {
    return (
      <>
        <p>คุณยังไม่ได้เขียนโพสต์เลย</p>
        <p className="mt-2">
          <Link href="/community/create" className="text-primary hover:underline">
            เขียนโพสต์แรก
          </Link>{" "}
          เล่าถึงงานเขียนหรือเรื่องที่เพิ่งอ่านได้เลย
        </p>
      </>
    );
  }

  if (feed === "saved") {
    return (
      <>
        <p>ยังไม่มีโพสต์ที่บันทึกไว้</p>
        <p className="mt-2">กดไอคอนบุ๊กมาร์กมุมขวาล่างของโพสต์ เพื่อเก็บไว้อ่านทีหลัง</p>
      </>
    );
  }

  return (
    <>
      <p>ยังไม่มีโพสต์ในชุมชน</p>
      <p className="mt-2">
        เป็นคนแรกที่{" "}
        <Link href="/community/create" className="text-primary hover:underline">
          เขียนโพสต์
        </Link>{" "}
        ได้เลย
      </p>
    </>
  );
}

/**
 * The search's own empty state (docs/COMMUNITY-FEED.md): not the feed's -
 * it names the query and offers to LOOSEN the search instead of a dead end.
 */
function EmptySearch({ state }: { state: SearchState }) {
  const options: Array<{ label: string; href: string }> = [];
  if (state.range !== "all") {
    options.push({
      label: "ขยายช่วงเวลาเป็นทั้งหมด",
      href: searchHref({ ...state, range: "all" }),
    });
  }
  if (state.from !== "all") {
    options.push({
      label: "ค้นหาจากทุกคน",
      href: searchHref({ ...state, from: "all" }),
    });
  }
  if (state.has) {
    options.push({
      label: "รวมโพสต์ทุกรูปแบบ",
      href: searchHref({ ...state, has: undefined }),
    });
  }

  return (
    <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
      <p>
        ไม่พบโพสต์ที่ตรงกับ <span className="font-medium">“{state.q}”</span>
      </p>
      {options.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <Link
              key={option.href}
              href={option.href}
              className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
            >
              {option.label}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-2">ลองคำอื่น หรือเช็กตัวสะกดอีกครั้ง</p>
      )}
    </div>
  );
}

function FeedBody({
  result,
  feed,
  type,
  searching,
  state,
  highlight,
  hrefFor,
  page,
}: {
  result: { items: CommunityPost[]; meta: ApiMeta } | null;
  feed: Feed;
  type?: CommunityPostType;
  searching: boolean;
  state: SearchState;
  highlight: string;
  hrefFor: (page: number) => string;
  page: number;
}) {
  if (result === null) {
    return (
      <p className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
        ไม่สามารถโหลดฟีดได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง
      </p>
    );
  }

  if (result.items.length === 0) {
    if (searching) {
      return <EmptySearch state={state} />;
    }
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
        <EmptyFeed feed={feed} type={type} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.meta.total / result.meta.per_page));

  return (
    <>
      <ol className="space-y-2.5">
        {result.items.map((post) => (
          <li key={post.id}>
            <PostCard post={post} highlight={searching ? highlight : undefined} />
          </li>
        ))}
      </ol>

      <FeedPagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </>
  );
}
