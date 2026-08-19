/**
 * The search page's data layer (search review 2026-08).
 *
 * One SearchFilters object is the whole state of a search. It serialises two
 * ways - into the URL (so every search is a shareable address, section C) and
 * into the API query - and both directions live HERE so they can never drift.
 *
 * Recent and saved searches are device-local (localStorage): what someone
 * searches for is theirs, and docs/11 keeps reading behaviour off the server
 * wherever a feature does not need it. Saved-search notifications would need
 * the server and are deliberately not promised here.
 */

import { getMany, getOne } from "@/lib/api";
import type { AuthorHit } from "@/lib/suggest-client";
import type { ApiMeta } from "@/types/api";
import type { Novel } from "@/types/novel";
import type { Tag } from "@/types/taxonomy";

export interface SearchFilters {
  q: string;
  /** Genre slugs - content-kind AND relationship-kind (คู่ชิป) mixed; the
      panel splits them by the taxonomy's `kind`. All must match. */
  genres: string[];
  /** Tag slugs that must all be present / must all be absent. */
  tags: string[];
  excludeTags: string[];
  status: string;
  format: string;
  structure: string;
  origin: string;
  rating: string;
  fandom: string;
  character: string;
  excludeWarnings: string[];
  minChapters: number;
  maxChapters: number;
  updatedWithin: number;
  variables: boolean;
  adult: boolean;
  sort: string;
  page: number;
}

export const EMPTY_FILTERS: SearchFilters = {
  q: "",
  genres: [],
  tags: [],
  excludeTags: [],
  status: "",
  format: "",
  structure: "",
  origin: "",
  rating: "",
  fandom: "",
  character: "",
  excludeWarnings: [],
  minChapters: 0,
  maxChapters: 0,
  updatedWithin: 0,
  variables: false,
  adult: false,
  sort: "",
  page: 1,
};

/** The per-option counts of the filter panel - GET /search/facets. */
export interface SearchFacets {
  total: number;
  status: Record<string, number>;
  presentation_format: Record<string, number>;
  story_structure: Record<string, number>;
  origin: Record<string, number>;
  rating: Record<string, number>;
  relationship: Record<string, number>;
  has_variables: number;
}

/** One public shelf matching a search - GET /search/shelves. */
export interface ShelfHit {
  id: string;
  name: string;
  note?: string;
  item_count: number;
  owner: { username: string; display_name?: string; avatar_url?: string };
  updated_at: string;
}

/** Which result tab is open (section F). */
export const SEARCH_TABS = ["novels", "authors", "tags", "shelves"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

export function searchTabOf(raw: string | undefined | null): SearchTab {
  return SEARCH_TABS.includes(raw as SearchTab) ? (raw as SearchTab) : "novels";
}

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function boundedInt(raw: string | null, max: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, max);
}

/** Parses a /search URL's params into filters. Unknown values fall away. */
export function filtersFromParams(params: URLSearchParams): SearchFilters {
  return {
    q: (params.get("q") ?? "").trim(),
    genres: splitList(params.get("genre")),
    tags: splitList(params.get("tag")),
    excludeTags: splitList(params.get("exclude_tag")),
    status: params.get("status") ?? "",
    format: params.get("presentation_format") ?? "",
    structure: params.get("story_structure") ?? "",
    origin: params.get("origin") ?? "",
    rating: params.get("rating") ?? "",
    fandom: (params.get("fandom") ?? "").trim(),
    character: (params.get("character") ?? "").trim(),
    excludeWarnings: splitList(params.get("exclude_warning")),
    minChapters: boundedInt(params.get("min_chapters"), 100000),
    maxChapters: boundedInt(params.get("max_chapters"), 100000),
    updatedWithin: boundedInt(params.get("updated_within"), 366),
    variables: params.get("variables") === "1",
    adult: params.get("adult") === "1",
    sort: params.get("sort") ?? "",
    page: Math.max(1, boundedInt(params.get("page"), 100000)),
  };
}

/**
 * Serialises filters into URL params. Defaults are OMITTED so a shared link
 * stays short and "no filter" round-trips as no parameter.
 */
export function paramsFromFilters(filters: SearchFilters, tab?: SearchTab): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (tab && tab !== "novels") params.set("type", tab);
  if (filters.genres.length) params.set("genre", filters.genres.join(","));
  if (filters.tags.length) params.set("tag", filters.tags.join(","));
  if (filters.excludeTags.length) params.set("exclude_tag", filters.excludeTags.join(","));
  if (filters.status) params.set("status", filters.status);
  if (filters.format) params.set("presentation_format", filters.format);
  if (filters.structure) params.set("story_structure", filters.structure);
  if (filters.origin) params.set("origin", filters.origin);
  if (filters.rating) params.set("rating", filters.rating);
  if (filters.fandom) params.set("fandom", filters.fandom);
  if (filters.character) params.set("character", filters.character);
  if (filters.excludeWarnings.length) {
    params.set("exclude_warning", filters.excludeWarnings.join(","));
  }
  if (filters.minChapters > 0) params.set("min_chapters", String(filters.minChapters));
  if (filters.maxChapters > 0) params.set("max_chapters", String(filters.maxChapters));
  if (filters.updatedWithin > 0) params.set("updated_within", String(filters.updatedWithin));
  if (filters.variables) params.set("variables", "1");
  if (filters.adult) params.set("adult", "1");
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

/** The API query for both /search/novels and /search/facets. */
export function apiQueryFromFilters(
  filters: SearchFilters,
): Record<string, string | number | boolean | undefined> {
  return {
    q: filters.q || undefined,
    genre: filters.genres.join(",") || undefined,
    tag: filters.tags.join(",") || undefined,
    exclude_tag: filters.excludeTags.join(",") || undefined,
    status: filters.status || undefined,
    presentation_format: filters.format || undefined,
    story_structure: filters.structure || undefined,
    origin: filters.origin || undefined,
    rating: filters.rating || undefined,
    fandom: filters.fandom || undefined,
    character: filters.character || undefined,
    exclude_warning: filters.excludeWarnings.join(",") || undefined,
    min_chapters: filters.minChapters > 0 ? filters.minChapters : undefined,
    max_chapters: filters.maxChapters > 0 ? filters.maxChapters : undefined,
    updated_within: filters.updatedWithin > 0 ? filters.updatedWithin : undefined,
    variables: filters.variables ? "1" : undefined,
    adult: filters.adult ? "1" : undefined,
    sort: filters.sort || undefined,
    page: filters.page > 1 ? filters.page : undefined,
  };
}

/** How many filter DIMENSIONS are active - the "ตัวกรอง (3)" number. */
export function activeFilterCount(filters: SearchFilters): number {
  let total = 0;
  total += filters.genres.length;
  total += filters.tags.length;
  total += filters.excludeTags.length;
  total += filters.excludeWarnings.length;
  if (filters.status) total += 1;
  if (filters.format) total += 1;
  if (filters.structure) total += 1;
  if (filters.origin) total += 1;
  if (filters.rating) total += 1;
  if (filters.fandom) total += 1;
  if (filters.character) total += 1;
  if (filters.minChapters > 0 || filters.maxChapters > 0) total += 1;
  if (filters.updatedWithin > 0) total += 1;
  if (filters.variables) total += 1;
  return total;
}

/**
 * Fetches one page of results. With a text query it is the search endpoint;
 * filters-only falls back to the plain listing, exactly as the server page
 * always did - the API requires `q` on /search/novels.
 */
export async function searchNovels(
  filters: SearchFilters,
  signal?: AbortSignal,
  perPage?: number,
): Promise<{ items: Novel[]; meta: ApiMeta }> {
  const path = filters.q ? "/search/novels" : "/novels";
  const query = apiQueryFromFilters(filters);
  if (perPage) query.per_page = perPage;
  return getMany<Novel>(path, { query, signal });
}

export async function searchFacets(
  filters: SearchFilters,
  signal?: AbortSignal,
): Promise<SearchFacets> {
  const query = apiQueryFromFilters(filters);
  delete query.sort;
  delete query.page;
  return getOne<SearchFacets>("/search/facets", { query, signal });
}

export async function searchAuthors(q: string, signal?: AbortSignal): Promise<AuthorHit[]> {
  if (!q.trim()) return [];
  return getOne<AuthorHit[]>("/search/authors", { query: { q }, signal });
}

export async function searchTags(
  q: string,
  signal?: AbortSignal,
): Promise<{ items: Tag[]; meta: ApiMeta }> {
  return getMany<Tag>("/tags", { query: { q: q || undefined, per_page: 30 }, signal });
}

export async function searchShelves(q: string, signal?: AbortSignal): Promise<ShelfHit[]> {
  if (!q.trim()) return [];
  return getOne<ShelfHit[]>("/search/shelves", { query: { q }, signal });
}

// --- recent + saved searches (device-local, section C) ----------------------

const RECENT_KEY = "ft:search:recent";
const SAVED_KEY = "ft:search:saved";
const RECENT_MAX = 8;
const SAVED_MAX = 10;

export interface SavedSearch {
  /** The /search query string, without the leading "?". */
  params: string;
  /** What the entry shows: the query, or a filter summary. */
  label: string;
  savedAt: number;
}

function readList(key: string): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SavedSearch =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as SavedSearch).params === "string" &&
        typeof (entry as SavedSearch).label === "string",
    );
  } catch {
    return [];
  }
}

function writeList(key: string, list: SavedSearch[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage full or blocked - recents are a convenience, not state.
  }
}

export function readRecentSearches(): SavedSearch[] {
  return readList(RECENT_KEY);
}

/** Records one executed search, newest first, deduplicated by its params. */
export function recordRecentSearch(entry: Omit<SavedSearch, "savedAt">): void {
  if (typeof window === "undefined" || !entry.label) return;
  const list = readList(RECENT_KEY).filter((it) => it.params !== entry.params);
  list.unshift({ ...entry, savedAt: Date.now() });
  writeList(RECENT_KEY, list.slice(0, RECENT_MAX));
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RECENT_KEY);
}

export function readSavedSearches(): SavedSearch[] {
  return readList(SAVED_KEY);
}

export function saveSearch(entry: Omit<SavedSearch, "savedAt">): SavedSearch[] {
  const list = readList(SAVED_KEY).filter((it) => it.params !== entry.params);
  list.unshift({ ...entry, savedAt: Date.now() });
  const next = list.slice(0, SAVED_MAX);
  writeList(SAVED_KEY, next);
  return next;
}

export function removeSavedSearch(params: string): SavedSearch[] {
  const next = readList(SAVED_KEY).filter((it) => it.params !== params);
  writeList(SAVED_KEY, next);
  return next;
}
