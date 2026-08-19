import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { NovelCoverCard } from "@/components/fiction/novel-card";
import { PageContainer } from "@/components/shell/page-container";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { AdultFilter } from "@/features/discovery/adult-filter";
import { ADULT_COOKIE, showsAdult } from "@/lib/adult-pref";
import { serverGetMany } from "@/lib/api-server";
import { isAuthenticated } from "@/lib/auth";
import { count } from "@/lib/format";
import type { Novel } from "@/types/novel";

/**
 * The listing page - where every "ดูทั้งหมด" on the site lands.
 *
 * A preset is a NAMED listing query, not a new kind of ranking: each one maps
 * to parameters the API already documents (docs/09 §10, §11), so the page can
 * never present an ordering the backend does not actually produce. Presets are
 * URLs, which makes every shelf on the home page a shareable destination.
 */

export const metadata: Metadata = {
  title: "รายการนิยาย",
};

const REVALIDATE_SECONDS = 60;
const PER_PAGE = 20;

interface Preset {
  key: string;
  label: string;
  title: string;
  subLabel: string;
  description: string;
  query: Record<string, string>;
}

const PRESETS: Preset[] = [
  {
    key: "popular",
    label: "ยอดนิยม",
    title: "ยอดนิยมตอนนี้",
    subLabel: "Most bookmarked",
    description: "เรียงตามจำนวนคนที่บันทึกเรื่องไว้ในคลัง",
    query: { sort: "popular" },
  },
  {
    key: "updated",
    label: "อัปเดตล่าสุด",
    title: "อัปเดตล่าสุด",
    subLabel: "Just updated",
    description: "เรื่องที่เพิ่งมีตอนใหม่หรือเพิ่งถูกแก้ไข",
    query: { sort: "updated" },
  },
  {
    key: "latest",
    label: "มาใหม่",
    title: "เรื่องมาใหม่",
    subLabel: "Newest fiction",
    description: "เรื่องที่เพิ่งเริ่มเผยแพร่บนแพลตฟอร์ม",
    query: { sort: "latest" },
  },
  {
    key: "completed",
    label: "จบแล้ว",
    title: "จบแล้ว อ่านรวดเดียว",
    subLabel: "Complete",
    description: "เรื่องที่เขียนจบแล้ว อ่านต่อเนื่องได้จนจบโดยไม่ต้องรอ",
    query: { status: "completed", sort: "popular" },
  },
  {
    key: "oneshot",
    label: "จบในตอน",
    title: "จบในตอนเดียว",
    subLabel: "One-shots",
    description: "เรื่องสั้นที่อ่านจบได้ในครั้งเดียว",
    query: { story_structure: "one_shot", sort: "popular" },
  },
  {
    // ร้อยแก้ว. The counterpart to แชทล้วน and เฮดแคนอน, which both had a
    // preset while the format most fiction is actually written in did not -
    // so "show me ordinary prose" was the one shape a reader could not ask
    // for. The navbar's สำรวจ menu names all three together.
    key: "standard",
    label: "ร้อยแก้ว",
    title: "ร้อยแก้ว",
    subLabel: "Prose",
    description: "เรื่องที่เล่าด้วยการบรรยายแบบร้อยแก้ว",
    query: { presentation_format: "standard", sort: "updated" },
  },
  {
    key: "chat",
    label: "แชทล้วน",
    title: "แชทฟิก",
    subLabel: "Chat fiction",
    description: "เรื่องที่เล่าผ่านบทสนทนา",
    query: { presentation_format: "chat", sort: "updated" },
  },
  {
    key: "headcanon",
    label: "เฮดแคนอน",
    title: "เฮดแคนอน",
    subLabel: "Headcanon",
    description: "งานเขียนที่ผู้เขียนจัดเป็นเฮดแคนอน",
    query: { content_mode: "headcanon", sort: "updated" },
  },
];

const DEFAULT_PRESET = PRESETS[0];

export default async function NovelsListPage({
  searchParams,
}: PageProps<"/novels">) {
  const params = await searchParams;

  const presetKey = typeof params.preset === "string" ? params.preset : "";
  const preset = PRESETS.find((item) => item.key === presetKey) ?? DEFAULT_PRESET;

  const author = typeof params.author === "string" ? params.author : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  // ซ่อนเนื้อหา 18+ (§13B). Read from a cookie because the listing is rendered
  // here, on the server: a preference the server cannot see cannot change what
  // it renders.
  const cookieStore = await cookies();
  const showAdult = showsAdult(cookieStore.get(ADULT_COOKIE)?.value);
  const signedIn = await isAuthenticated();

  // The API honours the widened listing only for a signed-in caller, so asking
  // for it means leaving the shared cached path. Everyone else - which is
  // almost everyone - keeps the cached page (docs/07 §67).
  const widened = showAdult && signedIn;

  let novels: Novel[] = [];
  let total = 0;
  let failed = false;

  try {
    const result = await serverGetMany<Novel>("/novels", {
      query: {
        ...preset.query,
        ...(author ? { author } : {}),
        ...(widened ? { adult: 1 } : {}),
        page,
        per_page: PER_PAGE,
      },
      // An author-filtered listing is still public data; it is the same for
      // every visitor, so it stays on the cacheable path - unless this reader
      // asked for a view that is specific to them.
      authenticated: widened,
      ...(widened ? {} : { revalidate: REVALIDATE_SECONDS }),
    });
    novels = result.items;
    total = result.meta.total;
  } catch {
    failed = true;
  }

  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));

  function pageHref(target: number): string {
    const search = new URLSearchParams();
    if (preset.key !== DEFAULT_PRESET.key) search.set("preset", preset.key);
    if (author) search.set("author", author);
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `/novels?${query}` : "/novels";
  }

  return (
    <main id="main">
      <PageContainer className="py-10 pb-16">
        <nav aria-label="เส้นทาง" className="mb-6 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-primary"
          >
            <Icon name="chevron-left" size={15} />
            หน้าแรก
          </Link>
        </nav>

        <header className="border-b border-hairline pb-6">
          <p className="mono-label">{preset.subLabel}</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight sm:text-[29px]">
            {author ? `ผลงานของ ${author}` : preset.title}
          </h1>
          <p className="mt-2 max-w-prose text-sm text-text-secondary">
            {author
              ? "เรื่องทั้งหมดของนักเขียนคนนี้ที่เผยแพร่อยู่ตอนนี้"
              : preset.description}
          </p>
        </header>

        <nav aria-label="มุมมองรายการ" className="mt-6 flex flex-wrap gap-2">
          {PRESETS.map((item) => (
            <Chip
              key={item.key}
              href={item.key === DEFAULT_PRESET.key ? "/novels" : `/novels?preset=${item.key}`}
              selected={!author && item.key === preset.key}
            >
              {item.label}
            </Chip>
          ))}
          <Chip href="/search">กรองละเอียดในหน้าค้นหา</Chip>
        </nav>

        <div className="mt-5">
          <AdultFilter showing={widened} signedIn={signedIn} />
        </div>

        {failed ? (
          <p className="mt-10 rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">
            โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้งในภายหลัง
          </p>
        ) : novels.length === 0 ? (
          <p className="mt-10 rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">
            ยังไม่มีเรื่องในรายการนี้
          </p>
        ) : (
          <>
            <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {novels.map((novel, index) => (
                <li key={novel.id}>
                  <NovelCoverCard
                    novel={novel}
                    // Only a genuinely ranked preset shows positions, and the
                    // number continues across pages rather than restarting.
                    rank={
                      preset.key === "popular" && !author
                        ? (page - 1) * PER_PAGE + index + 1
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>

            <p className="mt-8 text-xs text-text-muted">
              แสดง {count(novels.length)} จาก {count(total)} เรื่อง
            </p>

            {lastPage > 1 ? (
              <nav
                aria-label="หน้ารายการ"
                className="mt-4 flex items-center justify-center gap-2"
              >
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
                  >
                    <Icon name="chevron-left" size={15} />
                    ก่อนหน้า
                  </Link>
                ) : null}

                <span className="px-2 font-mono text-xs text-text-muted tabular-nums">
                  {page} / {lastPage}
                </span>

                {page < lastPage ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
                  >
                    ถัดไป
                    <Icon name="chevron-right" size={15} />
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </PageContainer>
    </main>
  );
}
