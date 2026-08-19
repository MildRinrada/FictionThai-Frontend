import type { Metadata } from "next";
import Link from "next/link";

import { NovelCoverCard } from "@/components/fiction/novel-card";
import { PageContainer } from "@/components/shell/page-container";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { serverGetMany, serverGetPublic } from "@/lib/api-server";
import type { Novel } from "@/types/novel";
import type { Genre } from "@/types/taxonomy";

/**
 * Explore - docs/03 §8 `/explore`: "discover novels without requiring the
 * user to know what they are looking for."
 *
 * A Server Component on the public fetch path: identical for every visitor,
 * cacheable, zero session work (docs/11 §12). Every section is one listing
 * call with a documented sort or filter - nothing here invents a ranking the
 * API does not provide.
 *
 * Of docs/03 §8's sections, Trending and New Writers are deliberately absent:
 * both need the statistics history of docs/08 §28, which is a later phase.
 * Rendering "trending" from data that cannot express it would be a lie.
 */

export const metadata: Metadata = {
  title: "สำรวจนิยาย",
  description: "ค้นพบนิยายใหม่ ๆ ตามหมวดหมู่ ความนิยม และการอัปเดตล่าสุด",
};

/** Public listings may be served up to this many seconds stale. */
const REVALIDATE_SECONDS = 60;

/** How many cards each shelf shows. */
const SECTION_SIZE = 6;

interface Section {
  key: string;
  title: string;
  subLabel: string;
  preset: string;
  query: Record<string, string | number>;
}

// Each section is a documented listing query (docs/09 §10, §11) - the link out
// of every shelf lands on the matching preset of the listing page.
const SECTIONS: Section[] = [
  {
    key: "latest",
    title: "มาใหม่ล่าสุด",
    subLabel: "Newest fiction",
    preset: "latest",
    query: { sort: "latest" },
  },
  {
    key: "popular",
    title: "ยอดนิยม",
    subLabel: "Most bookmarked",
    preset: "popular",
    query: { sort: "popular" },
  },
  {
    key: "updated",
    title: "อัปเดตล่าสุด",
    subLabel: "Recently updated",
    preset: "updated",
    query: { sort: "updated" },
  },
  {
    key: "completed",
    title: "จบแล้ว อ่านรวดเดียว",
    subLabel: "Complete",
    preset: "completed",
    query: { status: "completed", sort: "popular" },
  },
];

async function loadSection(section: Section): Promise<Novel[]> {
  try {
    const { items } = await serverGetMany<Novel>("/novels", {
      query: { ...section.query, per_page: SECTION_SIZE },
      authenticated: false,
      revalidate: REVALIDATE_SECONDS,
    });
    return items;
  } catch {
    // One failed shelf must not blank the page (docs/05 §30).
    return [];
  }
}

async function loadGenres(): Promise<Genre[]> {
  try {
    return await serverGetPublic<Genre[]>("/genres", { revalidate: REVALIDATE_SECONDS });
  } catch {
    return [];
  }
}

export default async function ExplorePage() {
  const [genres, ...shelves] = await Promise.all([
    loadGenres(),
    ...SECTIONS.map(loadSection),
  ]);

  return (
    <main id="main">
      <PageContainer className="py-10 pb-16">
        <header className="border-b border-hairline pb-6">
          <p className="mono-label">Explore</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight sm:text-[29px]">
            สำรวจนิยาย
          </h1>
          <p className="mt-2 max-w-prose text-sm text-text-secondary">
            ค้นพบเรื่องใหม่โดยไม่ต้องรู้ว่ากำลังหาอะไร -
            เริ่มจากแนวที่ชอบ หรือเลื่อนดูชั้นด้านล่าง
          </p>
        </header>

        {/* Categories - the controlled genre vocabulary (docs/03 §8). */}
        {genres.length > 0 ? (
          <nav aria-label="หมวดหมู่" className="mt-6 flex flex-wrap gap-2">
            {genres.map((genre) => (
              <Chip key={genre.id} href={`/search?genre=${encodeURIComponent(genre.slug)}`}>
                {genre.name}
              </Chip>
            ))}
            <Chip href="/search">ค้นหาแบบเจาะจง</Chip>
          </nav>
        ) : null}

        {SECTIONS.every((_, index) => shelves[index].length === 0) ? (
          <p className="mt-10 rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">
            ยังไม่มีนิยายที่เผยแพร่ให้สำรวจตอนนี้
          </p>
        ) : null}

        {SECTIONS.map((section, index) => {
          const items = shelves[index];
          if (items.length === 0) return null;

          return (
            <section
              key={section.key}
              aria-labelledby={`${section.key}-heading`}
              className="mt-12"
            >
              <SectionHeader
                id={`${section.key}-heading`}
                title={section.title}
                subLabel={section.subLabel}
                href={`/novels?preset=${section.preset}`}
              />
              <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
                {items.map((novel) => (
                  <li key={novel.id}>
                    <NovelCoverCard novel={novel} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <p className="mt-14 border-t border-hairline pt-6 text-sm text-text-secondary">
          หาเรื่องที่ต้องการไม่เจอ?{" "}
          <Link href="/search" className="text-primary hover:underline">
            ค้นหาด้วยตัวกรองละเอียด
          </Link>
        </p>
      </PageContainer>
    </main>
  );
}
