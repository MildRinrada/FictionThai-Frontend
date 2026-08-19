import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/shell/page-container";
import { serverGetMany, serverGetOne } from "@/lib/api-server";
import { getCurrentUserOrNull } from "@/lib/auth";
import type {
  ContinueReadingEntry,
  FinishedEntry,
  FollowedAuthor,
  HistoryEntry,
  HistorySettings,
  LibraryEntry,
} from "@/types/library";
import type { Novel } from "@/types/novel";
import type { Shelf } from "@/types/shelf";

import {
  LibraryView,
  type LibraryTabKey,
} from "@/features/library/library-view";

/**
 * ชั้นหนังสือของฉัน - docs/03 §13 `/library`, redesigned (library review
 * 2026-08) from three stacked lists into a reader's tool: five tabs whose
 * state lives in the URL, a stat header that navigates, and per-tab work
 * surfaces. The name finally matches the navbar - one word everywhere.
 *
 * Requires authentication; the redirect below is the UX affordance, and the
 * API's RequireAuth on every /me endpoint is the actual protection
 * (docs/07 §5, docs/11 §43). Everything personal is fetched WITH credentials
 * and never cached (docs/14 §7). Every list arrives already filtered to
 * fictions this caller may still read (docs/11 §31).
 */

export const metadata: Metadata = {
  title: "ชั้นหนังสือของฉัน",
  robots: { index: false, follow: false },
};

const TAB_KEYS: LibraryTabKey[] = [
  "reading",
  "shelves",
  "finished",
  "following",
  "history",
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/library");
  }

  const { tab: rawTab } = await searchParams;
  const initialTab = TAB_KEYS.includes(rawTab as LibraryTabKey)
    ? (rawTab as LibraryTabKey)
    : "reading";

  // Every dataset fetched concurrently; each failure degrades to its own
  // empty tab rather than blanking the page (docs/05 §30). The suggestions
  // exist for the empty states - a shelf with nothing on it should offer a
  // first move, not a grey box.
  const [reading, bookmarks, shelves, finished, following, history, historySettings, suggested] =
    await Promise.all([
      serverGetMany<ContinueReadingEntry>("/me/reading-progress").catch(() => null),
      serverGetMany<LibraryEntry>("/me/library").catch(() => null),
      serverGetMany<Shelf>("/me/shelves").catch(() => null),
      serverGetMany<FinishedEntry>("/me/finished").catch(() => null),
      serverGetMany<FollowedAuthor>("/me/following").catch(() => null),
      serverGetMany<HistoryEntry>("/me/history").catch(() => null),
      serverGetOne<HistorySettings>("/me/history/settings").catch(() => null),
      serverGetMany<Novel>("/novels", { query: { per_page: 4 } }).catch(() => null),
    ]);

  return (
    <main id="main">
      <PageContainer className="py-8 pb-16">
        <LibraryView
          initialTab={initialTab}
          data={{
            reading: reading?.items ?? [],
            readingMeta: reading?.meta ?? null,
            bookmarks: bookmarks?.items ?? [],
            bookmarksMeta: bookmarks?.meta ?? null,
            shelves: shelves?.items ?? [],
            finished: finished?.items ?? [],
            finishedMeta: finished?.meta ?? null,
            following: following?.items ?? [],
            followingMeta: following?.meta ?? null,
            history: history?.items ?? [],
            historyMeta: history?.meta ?? null,
            historySettings,
            suggestions: suggested?.items ?? [],
            username: user.username,
          }}
        />
      </PageContainer>
    </main>
  );
}
