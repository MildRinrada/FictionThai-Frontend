"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { EMPTY_SUGGESTIONS, suggest, type Suggestions } from "@/lib/suggest-client";

/**
 * ค้นหา - suggestions grouped by what they are, not a doorway to a results page.
 *
 * Typing here used to do nothing until Enter, which threw the reader onto
 * /search to start again. A fiction site's search box is asked four different
 * questions - a story, an author, a tag, and (for a writer) their own
 * unpublished chapter - and answering all four under labels is the difference
 * between a search box and a text field.
 *
 * **A writer's own drafts are in here.** That is the group public search can
 * never return: an unpublished chapter is invisible to every index on the
 * platform by design, so before this, the thing a writer looks for most often
 * was the one thing they could not find. One press goes straight to the editor.
 *
 * The form still works with JavaScript off and before hydration: it is a real
 * GET to /search, and the suggestions are an enhancement on top of it.
 */

const DEBOUNCE_MS = 220;

/** One row in the flattened keyboard list. */
interface Row {
  key: string;
  href: string;
  group: string;
  label: string;
  detail?: string;
  badge?: string;
}

function rowsOf(found: Suggestions): Row[] {
  const rows: Row[] = [];
  for (const hit of found.own) {
    rows.push({
      key: `own:${hit.novel_slug}:${hit.chapter_slug}`,
      href: `/studio/novels/${encodeURIComponent(hit.novel_slug)}/chapters/${encodeURIComponent(hit.chapter_slug)}`,
      group: "งานของฉัน",
      label: hit.chapter_label,
      detail: hit.novel_title,
      badge: hit.draft ? "ร่าง" : undefined,
    });
  }
  for (const novel of found.novels) {
    rows.push({
      key: `novel:${novel.slug}`,
      href: `/novel/${encodeURIComponent(novel.slug)}`,
      group: "เรื่อง",
      label: novel.title,
      detail: novel.author?.display_name ?? novel.author?.username,
    });
  }
  for (const author of found.authors) {
    rows.push({
      key: `author:${author.username}`,
      href: `/users/${encodeURIComponent(author.username)}`,
      group: "นักเขียน",
      label: author.display_name || author.username,
      detail: `@${author.username}`,
      badge: author.is_author ? "นักเขียน" : undefined,
    });
  }
  for (const tag of found.tags) {
    rows.push({
      key: `tag:${tag.slug}`,
      href: `/search?q=${encodeURIComponent(tag.name)}`,
      group: "แท็ก",
      label: `#${tag.name}`,
      detail: tag.novel_count ? `${tag.novel_count} เรื่อง` : undefined,
    });
  }
  return rows;
}

export function SiteSearch({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const box = useRef<HTMLInputElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Suggestions>(EMPTY_SUGGESTIONS);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const rows = rowsOf(found);

  // On /search the page's own box owns the query - two search fields that do
  // not agree is worse than one (search review 2026-08 section A1). The page
  // also takes over the Ctrl+K reflex. Checked where the hooks below can see
  // it, applied at render time - hooks must run unconditionally.
  const onSearchPage = pathname === "/search";

  // Ctrl+K / ⌘K anywhere on the site puts the caret in here - the same key the
  // studio's own palette uses, so there is one "search" reflex, not two. On
  // /search the page's own box holds that reflex instead.
  useEffect(() => {
    if (onSearchPage) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        box.current?.focus();
        box.current?.select();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSearchPage]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Debounced lookup. Every state change happens inside the timer or the
  // promise, never in the effect body itself (React Compiler).
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      const clear = window.setTimeout(() => setFound(EMPTY_SUGGESTIONS), 0);
      return () => window.clearTimeout(clear);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      suggest(trimmed, { signedIn, signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) {
            setFound(result);
            setCursor(-1);
          }
        })
        .catch(() => {
          // A failed suggestion is silence, not an error message in a header.
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, signedIn]);

  function go(row: Row) {
    setOpen(false);
    setQuery("");
    router.push(row.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setCursor((current) => (current + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => (current <= 0 ? rows.length - 1 : current - 1));
    } else if (event.key === "Enter" && cursor >= 0) {
      // Only when something is actually highlighted - otherwise Enter is the
      // plain form submit, which is what someone who ignored the list wants.
      event.preventDefault();
      go(rows[cursor]);
    }
  }

  if (onSearchPage) return null;

  return (
    // Width and visibility belong to the HEADER's wrapper (navbar review: the
    // search is the centre zone with a fixed measure, not a flex member of
    // the left group) - this root just fills what it is given.
    <div ref={wrapper} className="relative w-full min-w-0">
      <form
        action="/search"
        method="get"
        role="search"
        className="flex items-center gap-2 rounded-md border border-border bg-surface px-3"
      >
        <Icon name="search" size={16} className="text-text-muted" />
        <label htmlFor="site-search" className="sr-only">
          ค้นหาเรื่อง นักเขียน แท็ก
        </label>
        <input
          ref={box}
          id="site-search"
          name="q"
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && rows.length > 0}
          aria-controls="site-search-suggestions"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={signedIn ? "ค้นหาเรื่อง นักเขียน หรือตอนของฉัน" : "ค้นหาเรื่อง นักเขียน แท็ก"}
          className="min-h-9 w-full bg-transparent text-sm outline-none placeholder:text-text-muted"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1 font-mono text-[10px] text-text-muted lg:block">
          Ctrl K
        </kbd>
      </form>

      {open && rows.length > 0 ? (
        <div
          id="site-search-suggestions"
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-popover"
        >
          {rows.map((row, index) => {
            // The heading comes from comparing with the PREVIOUS row rather
            // than from a running variable: rows are already grouped in order,
            // and a value carried across a render is a value that survives into
            // the next one.
            const heading =
              index === 0 || rows[index - 1].group !== row.group ? row.group : null;
            return (
              <div key={row.key}>
                {heading ? (
                  <p className="mono-label px-3.5 pt-2 pb-1 text-text-muted">{heading}</p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(row)}
                  className={`flex w-full items-center gap-2 px-3.5 py-2 text-start text-sm ${
                    index === cursor ? "bg-surface-secondary text-text" : "text-text-secondary"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  {row.badge ? (
                    <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-text-muted">
                      {row.badge}
                    </span>
                  ) : null}
                  {row.detail ? (
                    <span className="max-w-32 shrink-0 truncate text-[11px] text-text-muted">
                      {row.detail}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}

          <a
            href={`/search?q=${encodeURIComponent(query.trim())}`}
            className="mt-1 block border-t border-hairline px-3.5 py-2 text-sm text-primary hover:bg-surface-secondary"
          >
            ดูผลทั้งหมดของ “{query.trim()}”
          </a>
        </div>
      ) : null}
    </div>
  );
}
