"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/icon";
import { getCommunityTags } from "@/lib/community-client";
import {
  clearRecentSearches,
  communityPrefsSnapshot,
  emptyCommunityPrefs,
  rememberSearch,
  removeSavedSearch,
  saveSearch,
  subscribeCommunityPrefs,
} from "@/lib/community-prefs";
import {
  SEARCH_HAS_LABELS,
  SEARCH_RANGE_LABELS,
  SEARCH_RANGES,
  SEARCH_SCOPE_LABELS,
  SEARCH_SCOPES,
  SEARCH_SORT_LABELS,
  SEARCH_SORTS,
  searchHref,
  type SearchHas,
  type SearchState,
} from "@/lib/community-search";
import { searchAuthors } from "@/lib/search-client";
import type { AuthorHit } from "@/lib/suggest-client";
import type { DiscussedFiction, TrendingTag } from "@/types/community";

/**
 * The community post search (docs/COMMUNITY-FEED.md, section B of the
 * redesign) - a SEPARATE search from the navbar's fiction search, and
 * visibly so: its own placeholder, no Ctrl-K, and it searches POSTS.
 *
 * The island owns only the input, the filter chips, autocomplete, and the
 * device-side search memory. Results are the PAGE's: submitting pushes a
 * /community?q=… URL and the Server Component fetches and renders - which is
 * what makes every search shareable and the back button honest.
 */

const DEBOUNCE_MS = 220;

interface Props {
  state: SearchState;
  /** Whether the page is currently showing search results. */
  active: boolean;
  /** The discussed fictions already fetched for the sidebar - the third
   * autocomplete group, at zero extra requests. */
  discussed: DiscussedFiction[];
}

type Suggestion =
  | { kind: "person"; hit: AuthorHit }
  | { kind: "tag"; tag: TrendingTag }
  | { kind: "fiction"; title: string };

export function PostSearch({ state, active, discussed }: Props) {
  const router = useRouter();
  const [input, setInput] = useState(state.q);
  const [focused, setFocused] = useState(false);
  // Chip state starts from the URL and follows it on navigation (the island
  // is keyed by the page on state.q, but chips can change without a push
  // while the query is still being typed).
  const [from, setFrom] = useState(state.from);
  const [range, setRange] = useState(state.range);
  const [has, setHas] = useState<SearchHas | undefined>(state.has);
  const [sort, setSort] = useState(state.sort);

  const [people, setPeople] = useState<AuthorHit[]>([]);
  const [tags, setTags] = useState<TrendingTag[]>([]);
  const [rawCursor, setCursor] = useState(-1);

  // Device memory is an external store; the server snapshot is empty, so the
  // panel only ever shows history after hydration.
  const prefs = useSyncExternalStore(
    subscribeCommunityPrefs,
    communityPrefsSnapshot,
    emptyCommunityPrefs,
  );
  const recents = prefs.recents;
  const saved = prefs.saved;
  const [justSaved, setJustSaved] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  // Close the panel on outside click / Escape.
  useEffect(() => {
    if (!focused) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocused(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [focused]);

  // The trailing token decides which autocomplete group is live.
  const personToken = /@([\p{L}\p{N}_.-]*)$/u.exec(input)?.[1];
  const tagToken = /#([\p{L}\p{M}\p{N}_]*)$/u.exec(input)?.[1];

  useEffect(() => {
    if (!focused) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (personToken !== undefined) {
        searchAuthors(personToken, controller.signal)
          .then((hits) => setPeople(hits.slice(0, 5)))
          .catch(() => setPeople([]));
        setTags([]);
      } else if (tagToken !== undefined) {
        getCommunityTags(tagToken)
          .then((items) => setTags(items.slice(0, 5)))
          .catch(() => setTags([]));
        setPeople([]);
      } else {
        setPeople([]);
        setTags([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [focused, personToken, tagToken, input]);

  const fictionMatches = useMemo(() => {
    const needle = input.trim().toLowerCase();
    if (needle === "" || personToken !== undefined || tagToken !== undefined) {
      return [];
    }
    return discussed
      .map((d) => d.fiction.novel_title)
      .filter((title) => title.toLowerCase().includes(needle))
      .slice(0, 3);
  }, [discussed, input, personToken, tagToken]);

  const suggestions: Suggestion[] = useMemo(
    () => [
      ...people.map((hit): Suggestion => ({ kind: "person", hit })),
      ...tags.map((tag): Suggestion => ({ kind: "tag", tag })),
      ...fictionMatches.map((title): Suggestion => ({ kind: "fiction", title })),
    ],
    [people, tags, fictionMatches],
  );

  // Clamped at render rather than reset by an effect: a shrunken list simply
  // drops the highlight.
  const cursor = rawCursor >= 0 && rawCursor < suggestions.length ? rawCursor : -1;

  const stateOf = (q: string): SearchState => ({ q, from, range, has, sort, type: state.type });

  const push = (q: string) => {
    const trimmed = q.trim();
    if (trimmed !== "") rememberSearch(trimmed);
    setFocused(false);
    router.push(searchHref(stateOf(trimmed)));
  };

  const applySuggestion = (suggestion: Suggestion) => {
    if (suggestion.kind === "person") {
      const next = input.replace(/@[\p{L}\p{N}_.-]*$/u, "") + `from:@${suggestion.hit.username} `;
      setInput(next);
      inputRef.current?.focus();
      return;
    }
    if (suggestion.kind === "tag") {
      const next = input.replace(/#[\p{L}\p{M}\p{N}_]*$/u, "") + `#${suggestion.tag.tag}`;
      setInput(next.trim());
      push(next.trim());
      return;
    }
    setInput(suggestion.title);
    push(suggestion.title);
  };

  // Chips apply instantly while a search is live; before the first submit
  // they only stage.
  const applyChip = (next: Partial<SearchState>) => {
    const merged: SearchState = { ...stateOf(input), ...next };
    setFrom(merged.from);
    setRange(merged.range);
    setHas(merged.has);
    setSort(merged.sort);
    if (active && input.trim() !== "") {
      router.push(searchHref(merged));
    }
  };

  const currentHref = searchHref(stateOf(input));
  const alreadySaved = saved.some((entry) => entry.href === currentHref);

  const showMemory =
    focused && input.trim() === "" && (recents.length > 0 || saved.length > 0);
  const showSuggestions = focused && suggestions.length > 0;

  const chipClass = (selected: boolean) =>
    `inline-flex min-h-7 items-center rounded-md border px-2 text-xs whitespace-nowrap ${
      selected
        ? "border-primary bg-primary text-white"
        : "border-border bg-surface text-text-secondary hover:border-primary-200 hover:text-text"
    }`;

  return (
    <div ref={rootRef} className="relative">
      <form
        role="search"
        aria-label="ค้นหาโพสต์ในชุมชน"
        onSubmit={(event) => {
          event.preventDefault();
          if (cursor >= 0 && cursor < suggestions.length) {
            applySuggestion(suggestions[cursor]);
            return;
          }
          push(input);
        }}
      >
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:border-primary">
          <Icon name="search" size={15} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestions.length > 0) {
                event.preventDefault();
                setCursor((c) => (c + 1) % suggestions.length);
              } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                event.preventDefault();
                setCursor((c) => (c <= 0 ? suggestions.length - 1 : c - 1));
              }
            }}
            placeholder="ค้นหาโพสต์ในชุมชน"
            aria-label="ค้นหาโพสต์ในชุมชน"
            aria-expanded={showSuggestions}
            aria-controls={listboxId}
            aria-autocomplete="list"
            role="combobox"
            className="min-h-9.5 w-full bg-transparent text-sm focus:outline-none"
          />
          {input !== "" || active ? (
            <button
              type="button"
              onClick={() => {
                setInput("");
                if (active) {
                  router.push("/community");
                } else {
                  inputRef.current?.focus();
                }
              }}
              aria-label="ล้างการค้นหา"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
      </form>

      {focused ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex flex-wrap items-center gap-1" role="group" aria-label="จาก">
              {SEARCH_SCOPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyChip({ from: value })}
                  className={chipClass(from === value)}
                >
                  {SEARCH_SCOPE_LABELS[value]}
                </button>
              ))}
            </span>
            <span className="flex flex-wrap items-center gap-1" role="group" aria-label="ช่วงเวลา">
              {SEARCH_RANGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyChip({ range: value })}
                  className={chipClass(range === value)}
                >
                  {SEARCH_RANGE_LABELS[value]}
                </button>
              ))}
            </span>
            <span className="flex flex-wrap items-center gap-1" role="group" aria-label="ประเภท">
              {(["chapter", "none"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyChip({ has: has === value ? undefined : value })}
                  className={chipClass(has === value)}
                >
                  {SEARCH_HAS_LABELS[value]}
                </button>
              ))}
            </span>
            <span className="flex flex-wrap items-center gap-1" role="group" aria-label="เรียง">
              {SEARCH_SORTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyChip({ sort: value })}
                  className={chipClass(sort === value)}
                >
                  {SEARCH_SORT_LABELS[value]}
                </button>
              ))}
            </span>
          </div>

          {input.trim() !== "" ? (
            <p className="mt-1.5 font-mono text-[11px] text-text-muted">
              from:@ชื่อ · to:@ชื่อ · has:chapter · fandom:&quot;…&quot; · #แท็ก
            </p>
          ) : null}
        </>
      ) : null}

      {showSuggestions ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="คำแนะนำการค้นหา"
          className="absolute inset-x-0 top-full z-30 mt-1 rounded-md border border-border bg-surface p-1 shadow-popover"
        >
          {people.length > 0 ? <GroupLabel>คน</GroupLabel> : null}
          {people.map((hit, index) => (
            <SuggestionRow
              key={`p-${hit.username}`}
              selected={cursor === index}
              onPick={() => applySuggestion({ kind: "person", hit })}
            >
              <span className="font-medium">
                {hit.display_name?.trim() || `@${hit.username}`}
              </span>
              {hit.display_name?.trim() ? (
                <span className="font-mono text-xs text-text-muted">@{hit.username}</span>
              ) : null}
            </SuggestionRow>
          ))}

          {tags.length > 0 ? <GroupLabel>แท็ก</GroupLabel> : null}
          {tags.map((tag, index) => (
            <SuggestionRow
              key={`t-${tag.tag}`}
              selected={cursor === people.length + index}
              onPick={() => applySuggestion({ kind: "tag", tag })}
            >
              <span>#{tag.tag}</span>
              <span className="font-mono text-xs text-text-muted">{tag.post_count} โพสต์</span>
            </SuggestionRow>
          ))}

          {fictionMatches.length > 0 ? <GroupLabel>เรื่องที่ถูกพูดถึง</GroupLabel> : null}
          {fictionMatches.map((title, index) => (
            <SuggestionRow
              key={`f-${title}`}
              selected={cursor === people.length + tags.length + index}
              onPick={() => applySuggestion({ kind: "fiction", title })}
            >
              <span className="truncate font-serif">{title}</span>
            </SuggestionRow>
          ))}
        </div>
      ) : null}

      {showMemory ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-md border border-border bg-surface p-2 shadow-popover">
          {saved.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between px-1">
                <GroupLabel>การค้นหาที่บันทึกไว้</GroupLabel>
              </div>
              <ul>
                {saved.map((entry) => (
                  <li key={entry.href} className="flex items-center gap-1">
                    <Link
                      href={entry.href}
                      onClick={() => setFocused(false)}
                      className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded px-2 text-[13px] hover:bg-surface-secondary"
                    >
                      <Icon name="bookmark" size={12} className="shrink-0 text-text-muted" />
                      <span className="truncate">{entry.label}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeSavedSearch(entry.href)}
                      aria-label={`ลบ ${entry.label}`}
                      className="flex size-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-secondary hover:text-text"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {recents.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between px-1">
                <GroupLabel>ค้นหาล่าสุด</GroupLabel>
                <button
                  type="button"
                  onClick={() => clearRecentSearches()}
                  className="text-[11px] text-text-muted hover:text-text"
                >
                  ล้าง
                </button>
              </div>
              <ul>
                {recents.map((entry) => (
                  <li key={entry}>
                    <button
                      type="button"
                      onClick={() => {
                        setInput(entry);
                        push(entry);
                      }}
                      className="flex min-h-8 w-full items-center gap-2 rounded px-2 text-start text-[13px] hover:bg-surface-secondary"
                    >
                      <Icon name="clock" size={12} className="shrink-0 text-text-muted" />
                      <span className="truncate">{entry}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {active && input.trim() !== "" ? (
        <div className="mt-2">
          <button
            type="button"
            disabled={alreadySaved || justSaved}
            onClick={() => {
              saveSearch({ label: input.trim(), href: currentHref });
              setJustSaved(true);
            }}
            className="text-xs text-text-muted hover:text-primary disabled:hover:text-text-muted"
          >
            {alreadySaved || justSaved ? "บันทึกการค้นหานี้แล้ว" : "บันทึกการค้นหานี้"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mono-label px-1 pt-1.5 pb-1 text-[10px]">{children}</p>;
}

function SuggestionRow({
  selected,
  onPick,
  children,
}: {
  selected: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={`flex min-h-8 w-full items-center gap-2 rounded px-2 text-start text-[13px] ${
        selected ? "bg-surface-secondary" : "hover:bg-surface-secondary"
      }`}
    >
      {children}
    </button>
  );
}
