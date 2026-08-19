import type { CommunityPostType } from "@/types/community";

/**
 * The community post-search grammar (docs/COMMUNITY-FEED.md).
 *
 * The URL keeps what the user TYPED (`?q=from:@mild ฟิคใหม่`), so a shared
 * link reproduces the search box exactly. This module turns that raw string
 * into the API's structured parameters - it runs on the server when the page
 * fetches results, and in the search island to power hints. The API itself
 * never sees operator syntax.
 *
 * Operators are an affordance for people who know them; plain text must work
 * exactly as well, which is why anything unrecognized simply stays text.
 *
 *   from:@handle        posts by one person        → author
 *   to:@handle          posts mentioning them      → mention
 *   has:chapter|none    attachment shape           → has
 *   fandom:"..."        the attached work's fandom → fandom
 *   #แท็ก (alone)       one extracted hashtag      → tag
 */

export type SearchScope = "all" | "following" | "me";
export type SearchRange = "all" | "24h" | "7d" | "month";
export type SearchHas = "chapter" | "none";
export type SearchSort = "new" | "top";

/** The chips' vocabulary, used by the UI and the URL alike. */
export const SEARCH_SCOPES: SearchScope[] = ["all", "following", "me"];
export const SEARCH_RANGES: SearchRange[] = ["all", "24h", "7d", "month"];
export const SEARCH_SORTS: SearchSort[] = ["new", "top"];

export const SEARCH_SCOPE_LABELS: Record<SearchScope, string> = {
  all: "ทุกคน",
  following: "คนที่ฉันติดตาม",
  me: "ฉันเอง",
};

export const SEARCH_RANGE_LABELS: Record<SearchRange, string> = {
  all: "ทั้งหมด",
  "24h": "24 ชม.",
  "7d": "7 วัน",
  month: "เดือนนี้",
};

export const SEARCH_HAS_LABELS: Record<SearchHas, string> = {
  chapter: "มีตอนแนบ",
  none: "ข้อความล้วน",
};

export const SEARCH_SORT_LABELS: Record<SearchSort, string> = {
  new: "ใหม่สุด",
  top: "มีปฏิสัมพันธ์มากสุด",
};

/** What parsing the typed query yields. */
export interface ParsedSearch {
  /** The free text left after operators are lifted out. */
  text: string;
  /** from:@handle (without the @). */
  author?: string;
  /** to:@handle (without the @). */
  mention?: string;
  /** has:chapter / has:none. */
  has?: SearchHas;
  /** fandom:"..." or fandom:word. */
  fandom?: string;
  /** A query that IS a single #tag searches the extracted tag instead. */
  tag?: string;
}

const FANDOM_QUOTED = /fandom:"([^"]*)"/giu;
const FANDOM_BARE = /fandom:([^\s"]+)/giu;
const FROM_OP = /from:@?([\p{L}\p{N}_.-]+)/giu;
const TO_OP = /to:@?([\p{L}\p{N}_.-]+)/giu;
const HAS_OP = /has:(chapter|none)/giu;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/** Parses the raw search input into structured intent. */
export function parseSearchInput(raw: string): ParsedSearch {
  let text = raw;
  const parsed: ParsedSearch = { text: "" };

  text = text.replace(FANDOM_QUOTED, (_, value: string) => {
    if (value.trim() !== "") parsed.fandom = value.trim();
    return " ";
  });
  text = text.replace(FANDOM_BARE, (_, value: string) => {
    parsed.fandom ??= value;
    return " ";
  });
  text = text.replace(FROM_OP, (_, value: string) => {
    parsed.author ??= value;
    return " ";
  });
  text = text.replace(TO_OP, (_, value: string) => {
    parsed.mention ??= value;
    return " ";
  });
  text = text.replace(HAS_OP, (_, value: string) => {
    parsed.has ??= value.toLowerCase() as SearchHas;
    return " ";
  });

  text = collapseSpaces(text);

  // A query that is exactly one #tag means the tag itself - matching the tag
  // chip and the trending panel. A #tag inside a longer sentence stays text;
  // the tag characters are in the content anyway.
  const soleTag = /^#([\p{L}\p{M}\p{N}_]+)$/u.exec(text);
  if (soleTag) {
    parsed.tag = soleTag[1];
    text = "";
  }

  parsed.text = text;
  return parsed;
}

/** Everything a search request needs, before it becomes query params. */
export interface SearchState {
  /** The raw typed query, exactly as the URL carries it. */
  q: string;
  from: SearchScope;
  range: SearchRange;
  has?: SearchHas;
  sort: SearchSort;
  type?: CommunityPostType | "";
}

/** Reads the search state out of the page's searchParams. */
export function searchStateOf(params: {
  q?: string;
  from?: string;
  range?: string;
  has?: string;
  sort?: string;
  type?: string;
}): SearchState {
  const from = SEARCH_SCOPES.includes(params.from as SearchScope)
    ? (params.from as SearchScope)
    : "all";
  const range = SEARCH_RANGES.includes(params.range as SearchRange)
    ? (params.range as SearchRange)
    : "all";
  const has =
    params.has === "chapter" || params.has === "none" ? params.has : undefined;
  const sort = params.sort === "top" ? "top" : "new";
  return { q: params.q ?? "", from, range, has, sort };
}

/**
 * Builds the API query for GET /search/posts from the state plus the parsed
 * operators. An operator inside the text wins over the matching chip - the
 * user typed it later and more deliberately.
 */
export function searchApiQuery(
  state: SearchState,
  parsed: ParsedSearch,
): Record<string, string | undefined> {
  return {
    q: parsed.tag ? undefined : parsed.text || undefined,
    tag: parsed.tag,
    author: parsed.author,
    mention: parsed.mention,
    fandom: parsed.fandom,
    has: parsed.has ?? state.has,
    from: state.from === "all" ? undefined : state.from,
    range: state.range === "all" ? undefined : state.range,
    sort: state.sort === "new" ? undefined : state.sort,
    type: state.type || undefined,
  };
}

/** Whether this state asks for a search at all (vs the plain feed). */
export function isSearching(state: SearchState): boolean {
  return state.q.trim() !== "";
}

/**
 * The /community URL for a search state - shareable, and the single source
 * the page re-reads it from.
 */
export function searchHref(state: SearchState): string {
  const params = new URLSearchParams();
  if (state.q.trim() !== "") params.set("q", state.q.trim());
  if (state.from !== "all") params.set("from", state.from);
  if (state.range !== "all") params.set("range", state.range);
  if (state.has) params.set("has", state.has);
  if (state.sort !== "new") params.set("sort", state.sort);
  if (state.type) params.set("type", state.type);
  const query = params.toString();
  return query === "" ? "/community" : `/community?${query}`;
}
