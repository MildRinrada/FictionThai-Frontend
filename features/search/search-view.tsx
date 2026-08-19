"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { EmptyState, Pager, totalPagesOf } from "@/features/library/shared";
import { FilterPanel } from "@/features/search/filter-panel";
import { ResultRow, ResultTile } from "@/features/search/result-card";
import { COVER_ASPECT } from "@/lib/cover";
import type { AuthorHit } from "@/lib/suggest-client";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  clearRecentSearches,
  filtersFromParams,
  paramsFromFilters,
  readRecentSearches,
  readSavedSearches,
  recordRecentSearch,
  removeSavedSearch,
  saveSearch,
  searchAuthors,
  searchFacets,
  searchNovels,
  searchShelves,
  searchTabOf,
  searchTags,
  type SavedSearch,
  type SearchFacets,
  type SearchFilters,
  type SearchTab,
  type ShelfHit,
} from "@/lib/search-client";
import { count } from "@/lib/format";
import type { ApiMeta } from "@/types/api";
import type { Novel } from "@/types/novel";
import type { Genre, Tag } from "@/types/taxonomy";

/**
 * The search page (search review 2026-08).
 *
 * The URL is still the whole state - every search stays a shareable address
 * (section C) - but navigation is SHALLOW: typing and filtering fetch from the
 * client and pushState the address, so the page never reloads under the
 * reader. The first paint is server-rendered from the same URL, and the form
 * fallback still submits GET /search before hydration.
 */

const VIEW_KEY = "ft:search:view";

interface SearchViewProps {
  initialFilters: SearchFilters;
  initialTab: SearchTab;
  initialResults: { items: Novel[]; meta: ApiMeta } | null;
  initialFacets: SearchFacets | null;
  genres: Genre[];
  signedIn: boolean;
}

/** One active-filter chip above the results (section C). */
interface AppliedChip {
  key: string;
  label: string;
  patch: Partial<SearchFilters>;
}

function appliedChips(filters: SearchFilters, genres: Genre[]): AppliedChip[] {
  const genreName = (slug: string) => genres.find((g) => g.slug === slug)?.name ?? slug;
  const chips: AppliedChip[] = [];

  for (const slug of filters.genres) {
    chips.push({
      key: `genre:${slug}`,
      label: genreName(slug),
      patch: { genres: filters.genres.filter((it) => it !== slug) },
    });
  }
  for (const slug of filters.tags) {
    chips.push({
      key: `tag:${slug}`,
      label: `แท็ก: ${slug}`,
      patch: { tags: filters.tags.filter((it) => it !== slug) },
    });
  }
  for (const slug of filters.excludeTags) {
    chips.push({
      key: `xtag:${slug}`,
      label: `ไม่เอาแท็ก: ${slug}`,
      patch: { excludeTags: filters.excludeTags.filter((it) => it !== slug) },
    });
  }
  for (const word of filters.excludeWarnings) {
    chips.push({
      key: `xwarn:${word}`,
      label: `ไม่เอา: ${word}`,
      patch: { excludeWarnings: filters.excludeWarnings.filter((it) => it !== word) },
    });
  }
  if (filters.status) {
    const labels: Record<string, string> = {
      ongoing: "กำลังเขียน",
      completed: "จบแล้ว",
      hiatus: "พักไว้",
    };
    chips.push({
      key: "status",
      label: labels[filters.status] ?? filters.status,
      patch: { status: "" },
    });
  }
  if (filters.format) {
    const labels: Record<string, string> = {
      standard: "ร้อยแก้ว",
      chat: "แชทล้วน",
      headcanon: "เฮดแคนอน",
    };
    chips.push({
      key: "format",
      label: labels[filters.format] ?? filters.format,
      patch: { format: "" },
    });
  }
  if (filters.structure) {
    chips.push({
      key: "structure",
      label: filters.structure === "one_shot" ? "ตอนเดียวจบ" : "หลายตอน",
      patch: { structure: "" },
    });
  }
  if (filters.origin) {
    const labels: Record<string, string> = {
      original: "แต่งเอง",
      fanfiction: "แฟนฟิค",
      crossover: "ครอสโอเวอร์",
      single: "ด้อมเดียวล้วน",
    };
    chips.push({
      key: "origin",
      label: labels[filters.origin] ?? filters.origin,
      patch: { origin: "" },
    });
  }
  if (filters.rating) {
    const labels: Record<string, string> = { general: "ทุกวัย", teen: "15+", mature: "18+" };
    chips.push({
      key: "rating",
      label: `เรต: ${labels[filters.rating] ?? filters.rating}`,
      patch: { rating: "" },
    });
  }
  if (filters.fandom) {
    chips.push({ key: "fandom", label: `ด้อม: ${filters.fandom}`, patch: { fandom: "" } });
  }
  if (filters.character) {
    chips.push({
      key: "character",
      label: `ตัวละคร: ${filters.character}`,
      patch: { character: "" },
    });
  }
  if (filters.minChapters > 0 || filters.maxChapters > 0) {
    const label =
      filters.maxChapters > 0
        ? `${filters.minChapters || 1}-${filters.maxChapters} ตอน`
        : `${filters.minChapters}+ ตอน`;
    chips.push({ key: "length", label, patch: { minChapters: 0, maxChapters: 0 } });
  }
  if (filters.updatedWithin > 0) {
    chips.push({
      key: "updated",
      label: `อัปเดตใน ${filters.updatedWithin} วัน`,
      patch: { updatedWithin: 0 },
    });
  }
  if (filters.variables) {
    chips.push({ key: "variables", label: "มี y/n", patch: { variables: false } });
  }
  return chips;
}

function SkeletonRows({ total }: { total: number }) {
  return (
    <ul aria-hidden className="space-y-3">
      {Array.from({ length: total }, (_, index) => (
        <li
          key={index}
          className="flex animate-pulse gap-4 rounded-xl border border-border bg-surface p-3.5"
        >
          <span className={`${COVER_ASPECT} w-16 rounded-sm bg-surface-secondary sm:w-20`} />
          <span className="flex-1 space-y-2 py-1">
            <span className="block h-4 w-2/3 rounded bg-surface-secondary" />
            <span className="block h-3 w-1/3 rounded bg-surface-secondary" />
            <span className="block h-3 w-full rounded bg-surface-secondary" />
            <span className="block h-3 w-1/2 rounded bg-surface-secondary" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SearchView({
  initialFilters,
  initialTab,
  initialResults,
  initialFacets,
  genres,
  signedIn,
}: SearchViewProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [tab, setTab] = useState(initialTab);
  const [results, setResults] = useState(initialResults);
  const [facets, setFacets] = useState(initialFacets);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const [authors, setAuthors] = useState<AuthorHit[] | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [shelves, setShelves] = useState<ShelfHit[] | null>(null);

  const [view, setView] = useState<"list" | "grid">("list");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recents, setRecents] = useState<SavedSearch[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  // When nothing matches, which single filter would recover the most results
  // (section E) - probed live, never guessed.
  const [recovery, setRecovery] = useState<{ chip: AppliedChip; total: number } | null>(null);
  const [fallback, setFallback] = useState<Novel[]>([]);

  const hydrated = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const chips = appliedChips(filters, genres);
  const attempted = filters.q !== "" || chips.length > 0;

  function apply(patch: Partial<SearchFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  // Device prefs and local lists, after paint.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        if (window.localStorage.getItem(VIEW_KEY) === "grid") setView("grid");
      } catch {
        // Blocked storage keeps the default.
      }
      setRecents(readRecentSearches());
      setSaved(readSavedSearches());
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Back/forward re-derive everything from the address (section C).
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setFilters(filtersFromParams(params));
      setTab(searchTabOf(params.get("type")));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ⌘K / Ctrl+K focuses the page's search box - the navbar box hides itself
  // on /search, so the shortcut must land here (section A1).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The one fetch pipeline: any change to filters or tab settles for 300ms,
  // then updates the address SHALLOWLY and fetches what the open tab needs.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }

    const timer = setTimeout(() => {
      const params = paramsFromFilters(filters, tab);
      const qs = params.toString();
      const href = qs ? `/search?${qs}` : "/search";
      if (`${window.location.pathname}${window.location.search}` !== href) {
        window.history.pushState(null, "", href);
      }

      controller.current?.abort();
      const aborter = new AbortController();
      controller.current = aborter;
      const { signal } = aborter;

      setFailed(false);
      setRecovery(null);

      if (tab === "authors") {
        setLoading(true);
        searchAuthors(filters.q, signal)
          .then((hits) => setAuthors(hits))
          .catch(() => !signal.aborted && setFailed(true))
          .finally(() => !signal.aborted && setLoading(false));
        return;
      }
      if (tab === "tags") {
        setLoading(true);
        searchTags(filters.q, signal)
          .then(({ items }) => setTags(items))
          .catch(() => !signal.aborted && setFailed(true))
          .finally(() => !signal.aborted && setLoading(false));
        return;
      }
      if (tab === "shelves") {
        setLoading(true);
        searchShelves(filters.q, signal)
          .then((hits) => setShelves(hits))
          .catch(() => !signal.aborted && setFailed(true))
          .finally(() => !signal.aborted && setLoading(false));
        return;
      }

      if (filters.q === "" && activeFilterCount(filters) === 0) {
        // Nothing asked yet: show the start panel, not an arbitrary listing.
        setResults(null);
        return;
      }

      setLoading(true);
      Promise.all([
        searchNovels(filters, signal),
        searchFacets(filters, signal).catch(() => null),
      ])
        .then(([page, counts]) => {
          setResults(page);
          if (counts) setFacets(counts);
          if (filters.q) {
            recordRecentSearch({ params: qs, label: filters.q });
            setRecents(readRecentSearches());
          }
          if (page.meta.total === 0) {
            void probeRecovery(filters, genres, signal, setRecovery, setFallback);
          }
        })
        .catch(() => !signal.aborted && setFailed(true))
        .finally(() => !signal.aborted && setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- genres is static
  }, [filters, tab]);

  function switchView(next: "list" | "grid") {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Preference only.
    }
  }

  // ↑↓ walk the result links; Esc clears the query (section F).
  function onResultsKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = resultsRef.current?.querySelectorAll<HTMLElement>("[data-search-result]");
    if (!links || links.length === 0) return;
    const active = document.activeElement;
    const at = Array.from(links).findIndex((link) => link === active);
    const next = event.key === "ArrowDown" ? at + 1 : at - 1;
    if (next < 0) {
      inputRef.current?.focus();
    } else if (next < links.length) {
      links[next].focus();
    }
    event.preventDefault();
  }

  const totalLabel = results ? `พบ ${count(results.meta.total)} เรื่อง` : "";
  const currentParams = paramsFromFilters(filters, tab).toString();

  const tabs: Array<{ value: SearchTab; label: string; total?: number }> = [
    { value: "novels", label: "เรื่อง", total: results?.meta.total },
    { value: "authors", label: "นักเขียน" },
    { value: "tags", label: "แท็ก" },
    { value: "shelves", label: "ชั้นหนังสือสาธารณะ" },
  ];

  return (
    <div className="mx-auto w-full">
      {/* The search box is the FIRST thing on the page (section A3) - the old
          120px hero said nothing a reader needed. */}
      <form
        role="search"
        method="get"
        action="/search"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ page: 1 });
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <span className="absolute inset-s-3 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            id="search-q"
            type="search"
            name="q"
            value={filters.q}
            onChange={(event) => apply({ q: event.target.value, page: 1 })}
            onKeyDown={(event) => {
              if (event.key === "Escape" && filters.q) {
                event.preventDefault();
                apply({ q: "", page: 1 });
              }
              if (event.key === "ArrowDown") {
                const first =
                  resultsRef.current?.querySelector<HTMLElement>("[data-search-result]");
                if (first) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
            placeholder="ชื่อเรื่อง นักเขียน แฟนด้อม หรือแท็ก…"
            aria-label="คำค้นหา"
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-border bg-surface ps-10 pe-4 text-[15px] focus:border-primary focus:outline-none"
          />
        </div>
        {/* Results arrive as you type; the button is the no-JS fallback and
            stays quiet (section A2). */}
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
        >
          ค้นหา
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm text-text-secondary hover:border-primary-200 hover:text-text lg:hidden"
        >
          <Icon name="filter" size={16} />
          ตัวกรอง{chips.length > 0 ? ` (${chips.length})` : ""}
        </button>
      </form>

      {filters.q.trim().length === 1 ? (
        <p className="mt-2 text-xs text-text-muted">
          คำค้นสั้นมาก ผลลัพธ์อาจกว้างเกินไป - ลองพิมพ์ต่อ หรือเจาะด้วยแฟนด้อม/แท็กทางซ้าย
        </p>
      ) : null}

      {/* Result-kind tabs (section F): the navbar promises author search, so
          the page delivers it. */}
      <nav aria-label="ชนิดผลลัพธ์" className="mt-5 border-b border-hairline">
        <ul className="scrollbar-none -mb-px flex gap-5 overflow-x-auto">
          {tabs.map((it) => {
            const selected = it.value === tab;
            return (
              <li key={it.value}>
                <button
                  type="button"
                  onClick={() => setTab(it.value)}
                  aria-current={selected ? "true" : undefined}
                  className={`inline-flex items-baseline gap-1.5 border-b-2 pb-2.5 text-sm whitespace-nowrap ${
                    selected
                      ? "border-primary font-medium text-text"
                      : "border-transparent text-text-secondary hover:text-text"
                  }`}
                >
                  {it.label}
                  {it.total !== undefined && attempted ? (
                    <span className="font-mono text-xs text-text-muted tabular-nums">
                      {count(it.total)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        {/* The filter panel: visible options, not hidden selects (A4). It
            filters STORIES; the other tabs stand alone. */}
        <aside
          aria-label="ตัวกรอง"
          className={`hidden lg:block ${tab === "novels" ? "" : "lg:invisible"}`}
        >
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6 pe-1">
            <FilterPanel
              genres={genres}
              facets={facets}
              filters={filters}
              signedIn={signedIn}
              onChange={apply}
            />
          </div>
        </aside>

        <div ref={resultsRef} onKeyDown={onResultsKeyDown}>
          {tab === "novels" ? (
            <>
              {chips.length > 0 ? (
                <div className="mb-4 flex flex-wrap items-center gap-1.5">
                  {chips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => apply({ ...chip.patch, page: 1 })}
                      title="เอาตัวกรองนี้ออก"
                      className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-primary-50 px-2.5 text-xs text-primary hover:bg-primary-100"
                    >
                      {chip.label}
                      <span aria-hidden>✕</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      apply({ ...EMPTY_FILTERS, q: filters.q, adult: filters.adult, sort: "" })
                    }
                    className="text-xs text-text-secondary underline-offset-2 hover:text-primary hover:underline"
                  >
                    ล้างทั้งหมด
                  </button>
                </div>
              ) : null}

              {attempted && results ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h1 className="text-sm text-text-secondary">
                    {filters.q ? (
                      <>
                        ผลการค้นหา “<span className="font-medium text-text">{filters.q}</span>”
                        <span className="ms-2">{totalLabel}</span>
                      </>
                    ) : (
                      totalLabel
                    )}
                  </h1>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSaved(
                          saveSearch({
                            params: currentParams,
                            label:
                              filters.q ||
                              chips
                                .slice(0, 3)
                                .map((chip) => chip.label)
                                .join(" · "),
                          }),
                        );
                        setJustSaved(true);
                      }}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
                    >
                      <Icon name={justSaved ? "check" : "bookmark"} size={13} />
                      {justSaved ? "บันทึกแล้ว" : "บันทึกการค้นหานี้"}
                    </button>
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <span className="sr-only">เรียงตาม</span>
                      <select
                        value={filters.sort}
                        onChange={(event) => apply({ sort: event.target.value, page: 1 })}
                        className="min-h-8 rounded-md border border-border bg-surface px-2 text-xs"
                      >
                        <option value="">{filters.q ? "เกี่ยวข้องที่สุด" : "ล่าสุด"}</option>
                        <option value="updated">อัปเดตล่าสุด</option>
                        <option value="popular">ยอดนิยม</option>
                        <option value="shelved">ถูกเก็บเข้าชั้นมากสุด</option>
                        <option value="title">ชื่อเรื่อง ก-ฮ</option>
                      </select>
                    </label>
                    <div
                      role="group"
                      aria-label="มุมมอง"
                      className="flex overflow-hidden rounded-md border border-border"
                    >
                      <button
                        type="button"
                        onClick={() => switchView("list")}
                        aria-pressed={view === "list"}
                        title="มุมมองรายการ"
                        className={`inline-flex size-8 items-center justify-center ${
                          view === "list"
                            ? "bg-surface-secondary text-text"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        <Icon name="list" size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => switchView("grid")}
                        aria-pressed={view === "grid"}
                        title="มุมมองปก"
                        className={`inline-flex size-8 items-center justify-center ${
                          view === "grid"
                            ? "bg-surface-secondary text-text"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        <Icon name="grid" size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <NovelResults
                attempted={attempted}
                loading={loading}
                failed={failed}
                results={results}
                filters={filters}
                view={view}
                signedIn={signedIn}
                recovery={recovery}
                fallback={fallback}
                recents={recents}
                saved={saved}
                onApply={apply}
                onOpenSaved={(entry) => {
                  const params = new URLSearchParams(entry.params);
                  setFilters(filtersFromParams(params));
                  setTab(searchTabOf(params.get("type")));
                }}
                onRemoveSaved={(entry) => setSaved(removeSavedSearch(entry.params))}
                onClearRecents={() => {
                  clearRecentSearches();
                  setRecents([]);
                }}
              />
            </>
          ) : null}

          {tab === "authors" ? (
            <AuthorResults q={filters.q} loading={loading} authors={authors} />
          ) : null}
          {tab === "tags" ? (
            <TagResults
              loading={loading}
              tags={tags}
              onPick={(tag) => {
                setTab("novels");
                apply({ tags: [tag.slug], q: "", page: 1 });
              }}
            />
          ) : null}
          {tab === "shelves" ? (
            <ShelfResults q={filters.q} loading={loading} shelves={shelves} />
          ) : null}
        </div>
      </div>

      {/* Mobile: the same panel as a bottom sheet (section F). */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="ตัวกรอง">
          <button
            type="button"
            aria-label="ปิดตัวกรอง"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-surface p-5 pb-8 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium">ตัวกรอง</p>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="inline-flex min-h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
              >
                ดูผลลัพธ์{results ? ` (${count(results.meta.total)})` : ""}
              </button>
            </div>
            <FilterPanel
              genres={genres}
              facets={facets}
              filters={filters}
              signedIn={signedIn}
              onChange={apply}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Probes which single active filter is cutting the most results (section E):
 * one 1-per-page request per dimension, then the best recovery is offered as
 * a button. Falls back to popular works so the page never dead-ends.
 */
async function probeRecovery(
  filters: SearchFilters,
  genres: Genre[],
  signal: AbortSignal,
  setRecovery: (value: { chip: AppliedChip; total: number } | null) => void,
  setFallback: (novels: Novel[]) => void,
) {
  const chips = appliedChips(filters, genres);

  try {
    const fallbackFilters: SearchFilters = {
      ...EMPTY_FILTERS,
      adult: filters.adult,
      sort: "popular",
    };
    const [probes, popular] = await Promise.all([
      Promise.all(
        chips.slice(0, 6).map((chip) =>
          searchNovels({ ...filters, ...chip.patch, page: 1 }, signal, 1)
            .then(({ meta }) => ({ chip, total: meta.total }))
            .catch(() => ({ chip, total: 0 })),
        ),
      ),
      searchNovels(fallbackFilters, signal, 4).catch(() => ({ items: [] as Novel[] })),
    ]);
    if (signal.aborted) return;

    const best = probes.filter((probe) => probe.total > 0).sort((a, b) => b.total - a.total)[0];
    setRecovery(best ?? null);
    setFallback(popular.items.slice(0, 4));
  } catch {
    // The empty state stands on its own.
  }
}

function NovelResults({
  attempted,
  loading,
  failed,
  results,
  filters,
  view,
  signedIn,
  recovery,
  fallback,
  recents,
  saved,
  onApply,
  onOpenSaved,
  onRemoveSaved,
  onClearRecents,
}: {
  attempted: boolean;
  loading: boolean;
  failed: boolean;
  results: { items: Novel[]; meta: ApiMeta } | null;
  filters: SearchFilters;
  view: "list" | "grid";
  signedIn: boolean;
  recovery: { chip: AppliedChip; total: number } | null;
  fallback: Novel[];
  recents: SavedSearch[];
  saved: SavedSearch[];
  onApply: (patch: Partial<SearchFilters>) => void;
  onOpenSaved: (entry: SavedSearch) => void;
  onRemoveSaved: (entry: SavedSearch) => void;
  onClearRecents: () => void;
}) {
  if (loading) {
    return <SkeletonRows total={Math.min(results?.items.length || 6, 10)} />;
  }
  if (failed) {
    return (
      <EmptyState icon="alert" title="ค้นหาไม่สำเร็จ" body="ลองใหม่อีกครั้งในอีกสักครู่" />
    );
  }

  if (!attempted || !results) {
    // The start panel: what this device searched before, what it saved, and a
    // route into the catalogue (section C4).
    return (
      <div className="space-y-6">
        {saved.length > 0 ? (
          <section>
            <h2 className="mb-2 text-xs font-medium text-text-secondary">การค้นหาที่บันทึกไว้</h2>
            <ul className="flex flex-wrap gap-1.5">
              {saved.map((entry) => (
                <li key={entry.params} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onOpenSaved(entry)}
                    className="inline-flex min-h-7 items-center rounded-s-full border border-e-0 border-border ps-3 pe-1.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
                  >
                    {entry.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`ลบ ${entry.label}`}
                    onClick={() => onRemoveSaved(entry)}
                    className="inline-flex min-h-7 items-center rounded-e-full border border-border pe-2.5 ps-1 text-xs text-text-muted hover:text-error"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {recents.length > 0 ? (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-xs font-medium text-text-secondary">ค้นหาล่าสุดของคุณ</h2>
              <button
                type="button"
                onClick={onClearRecents}
                className="text-[11px] text-text-muted hover:text-error"
              >
                ล้างประวัติ
              </button>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {recents.map((entry) => (
                <li key={entry.params}>
                  <button
                    type="button"
                    onClick={() => onOpenSaved(entry)}
                    className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
                  >
                    <Icon name="clock" size={12} />
                    {entry.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <EmptyState
          icon="search"
          title="พิมพ์คำค้น หรือเลือกตัวกรองทางซ้าย"
          body="ค้นได้ทั้งชื่อเรื่อง คำโปรย นักเขียน แฟนด้อม หมวด และแท็ก - ทุกการค้นหาแชร์เป็นลิงก์ได้"
        >
          <Link
            href="/explore"
            className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
          >
            หรือเปิดหน้าสำรวจแทน →
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (results.items.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="search"
          title={filters.q ? `ไม่พบเรื่องที่ตรงกับ “${filters.q}”` : "ไม่พบเรื่องที่ตรงกับตัวกรอง"}
          body={
            recovery
              ? undefined
              : "ลองตัดคำค้นให้สั้นลง สะกดแบบอื่น หรือถอดตัวกรองบางตัวออก"
          }
        >
          {recovery ? (
            <button
              type="button"
              onClick={() => onApply({ ...recovery.chip.patch, page: 1 })}
              className="mt-1 inline-flex min-h-9 items-center rounded-md border border-primary-200 px-3.5 text-sm text-primary hover:bg-primary-50"
            >
              ถอด “{recovery.chip.label}” ออก → พบ {count(recovery.total)} เรื่อง
            </button>
          ) : null}
        </EmptyState>

        {fallback.length > 0 ? (
          <section>
            <h2 className="mb-3 text-xs font-medium text-text-secondary">
              เรื่องยอดนิยมตอนนี้
            </h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {fallback.map((novel) => (
                <li key={novel.id}>
                  <ResultTile novel={novel} q="" signedIn={signedIn} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  const totalPages = totalPagesOf(results.meta);

  return (
    <>
      {view === "list" ? (
        <ul className="space-y-3">
          {results.items.map((novel) => (
            <li key={novel.id}>
              <ResultRow novel={novel} q={filters.q} signedIn={signedIn} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
          {results.items.map((novel) => (
            <li key={novel.id}>
              <ResultTile novel={novel} q={filters.q} signedIn={signedIn} />
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={filters.page}
        totalPages={totalPages}
        onPage={(page) => {
          onApply({ page });
          window.scrollTo({ top: 0 });
        }}
      />
    </>
  );
}

function AuthorResults({
  q,
  loading,
  authors,
}: {
  q: string;
  loading: boolean;
  authors: AuthorHit[] | null;
}) {
  if (!q.trim()) {
    return (
      <EmptyState icon="user" title="พิมพ์ชื่อนักเขียนหรือชื่อผู้ใช้" body="เช่น ชื่อที่เห็นบนปกเรื่อง" />
    );
  }
  if (loading || authors === null) return <SkeletonRows total={3} />;
  if (authors.length === 0) {
    return <EmptyState icon="user" title={`ไม่พบนักเขียนที่ตรงกับ “${q}”`} />;
  }
  return (
    <ul className="space-y-2">
      {authors.map((author) => {
        const name = author.display_name ?? author.username;
        return (
          <li key={author.username}>
            <Link
              href={`/users/${encodeURIComponent(author.username)}`}
              data-search-result
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary-200"
            >
              {author.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- own media route
                <img src={author.avatar_url} alt="" className="size-10 rounded-full object-cover" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-50 font-medium text-primary">
                  {[...name][0] ?? "?"}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text">{name}</span>
                <span className="block text-xs text-text-secondary">
                  @{author.username}
                  {author.is_author ? " · มีผลงานเผยแพร่" : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TagResults({
  loading,
  tags,
  onPick,
}: {
  loading: boolean;
  tags: Tag[] | null;
  onPick: (tag: Tag) => void;
}) {
  if (loading || tags === null) return <SkeletonRows total={2} />;
  if (tags.length === 0) return <EmptyState icon="type" title="ไม่พบแท็กที่ตรงกัน" />;
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag.id}>
          <button
            type="button"
            data-search-result
            onClick={() => onPick(tag)}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-3.5 text-sm text-text-secondary hover:border-primary-200 hover:text-primary"
          >
            {tag.name}
            {tag.novel_count ? (
              <span className="font-mono text-xs text-text-muted">{count(tag.novel_count)}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ShelfResults({
  q,
  loading,
  shelves,
}: {
  q: string;
  loading: boolean;
  shelves: ShelfHit[] | null;
}) {
  if (!q.trim()) {
    return (
      <EmptyState
        icon="library"
        title="พิมพ์ชื่อชั้นหนังสือ"
        body="ค้นเฉพาะชั้นที่เจ้าของเปิดเป็นสาธารณะ"
      />
    );
  }
  if (loading || shelves === null) return <SkeletonRows total={3} />;
  if (shelves.length === 0) {
    return <EmptyState icon="library" title={`ไม่พบชั้นหนังสือสาธารณะที่ตรงกับ “${q}”`} />;
  }
  return (
    <ul className="space-y-2">
      {shelves.map((shelf) => {
        const owner = shelf.owner.display_name ?? shelf.owner.username;
        return (
          <li key={shelf.id}>
            <Link
              href={`/users/${encodeURIComponent(shelf.owner.username)}?tab=shelves`}
              data-search-result
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 hover:border-primary-200"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text">{shelf.name}</span>
                <span className="mt-0.5 block truncate text-xs text-text-secondary">
                  โดย {owner}
                  {shelf.note ? ` · ${shelf.note}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-text-muted">
                {count(shelf.item_count)} เรื่อง
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
